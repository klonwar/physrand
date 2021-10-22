import TelegramBot, { Message } from "node-telegram-bot-api";
import chalk from "chalk";
import writeFile from "#src/core/util/write-file";
import readFile from "#src/core/util/read-file";
import Task from "#src/core/task/task";
import * as fs from "fs";
import moment from "moment";
import { TELEGRAM_CONFIG } from "#src/config";
import * as path from "path";
import Docxtemplater from "docxtemplater";
import pizzip from "pizzip";

interface UserAnswer {
  height: number,
  weight: number,
}

interface UserInfo {
  username: string,
  userAnswer?: UserAnswer
  imt?: number
}

class TelegramClient extends TelegramBot {
  private readonly chatIdsFile = `db/chat-ids.db`;
  private readonly userInfosFile = `db/user-infos.db`;
  private chatIds: Array<number> = [];
  tasks = new Map<number, Task>();
  users = new Map<number, UserInfo>();

  getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  isUserWithInfo(msg: Message): boolean {
    return !!this.users.get(msg.chat.id)?.userAnswer;
  }

  constructor(token: string, options?: TelegramBot.ConstructorOptions) {
    super(token, options);

    this.setMyCommands([
      {command: `/start`, description: `Start bot`},
      {command: `/help`, description: `Show help`},
      {command: `/set `, description: `Set height and weight. /set 170 70`},
      {command: `/template `, description: `Get template file`},
      {command: `/ping `, description: `Check bot availability`},
      {command: `/status `, description: `Show bot status`},
    ]);

    this.onText(/\/start/, async (msg) => {
      if (!this.chatIds.includes(msg.chat.id)) {
        console.log(`-@@ [${chalk.greenBright(`BOT`)}] +${msg.chat.id}`);
        this.chatIds.push(msg.chat.id);
        this.users.set(msg.chat.id, {
          username: msg.chat.username
        });
        await this.saveIds();
        await this.saveUserInfos();
      }
    });

    this.onText(/\/set/, async (msg) => {
      const match = msg.text.match(/\/set ([\d]+)[\s]+([\d]+)/);
      if (!match || !match[1] || !match[2]) {
        await this.sendMessage(
          msg.chat.id,
          `Формат: \n\`/set 170 70\``,
          {parse_mode: `MarkdownV2`}
        );
        return;
      }
      const height = parseInt(match[1]) / 100;
      const weight = parseInt(match[2]);

      if (height < 0.5 || height > 3 || weight < 30 || weight > 200) {
        await this.sendMessage(
          msg.chat.id,
          `Чзх? Введи нормально, блин`
        );
        return;
      }

      const imt = weight / (height ** 2);
      if (!this.users.get(msg.chat.id)) {
        this.users.set(msg.chat.id, {
          username: msg.chat.username
        });
      }
      this.users.get(msg.chat.id).userAnswer = {
        height, weight
      };
      this.users.get(msg.chat.id).imt = imt;

      await this.saveUserInfos();
      await this.sendMessage(
        msg.chat.id,
        `Ок`
      );

    });

    this.onText(/\/help/, async (msg) => {
      await this.sendMessage(
        msg.chat.id,
        TELEGRAM_CONFIG.helpMessage,
      );
    });

    this.onText(/\/template/, async (msg) => {
      fs.readFile(path.join(`files`, `_template.docx`), null, (err, data) => {
        if (err)
          throw err;

        this.sendDocument(
          msg.chat.id,
          data,
          {},
          {
            filename: `template.docx`
          }
        );
      });
    });

    this.onText(/\/ping/, async (msg) => {
      await this.sendMessage(
        msg.chat.id,
        `Alive`
      );
    });

    this.onText(/\/status/, async (msg) => {
      const botStatus = this.tasks.get(msg.chat.id)?.botStatus;
      if (!botStatus)
        await this.sendMessage(
          msg.chat.id,
          `Ничего не скачиваю`
        );
      else {
        const lastDate = botStatus[botStatus.length - 1].start;

        const deltas = {
          d: moment().diff(lastDate, `days`),
          h: moment().diff(lastDate, `hours`),
          m: moment().diff(lastDate, `minutes`),
          s: moment().diff(lastDate, `seconds`),
          ms: moment().diff(lastDate, `milliseconds`),
        };
        const timeLabel = Object.entries(deltas).find(([, value]) => {
          if (value) {
            return true;
          }
        }).reverse().join(``);

        await this.sendMessage(
          msg.chat.id,
          botStatus.map((item) => `_${item.status}_`).join(` / `) + ` \\- ${timeLabel}`,
          {parse_mode: `MarkdownV2`}
        );
      }
    });

    /*
        this.onText(/https:\/\/[a-zA-Z0-9_-]+\.edu\.vsu\.ru\/bigbluebutton\/presentation\/[a-zA-Z0-9/_-]+\/svg(\/[0-9]*)?/, async (msg, match) => {
          const link = match[0].replace(/\/svg\/[0-9]+/, `/svg/`);

          if (this.tasks.get(msg.chat.id)) {
            await this.sendMessage(
              msg.chat.id,
              `Скачивание уже запущено, ожидайте`
            );
            return;
          }

          console.log(`-@ Downloading ${link} for @${msg.chat.username}`);
          await this.sendMessage(
            msg.chat.id,
            `Скачиваю ${link}`
          );

          this.tasks.set(msg.chat.id, new Task(link, async (props) => {
            if (!props) {
              await this.sendMessage(
                msg.chat.id,
                `По данной ссылке нет ни одного слайда`
              );
            } else {
              const {file, filename} = props;
              await this.sendDocument(msg.chat.id, file, {}, {
                filename,
              });
            }

            console.log(`-@ Completed task for @${msg.chat.username}`);
            this.tasks.delete(msg.chat.id);
          }));
        });
    */

    this.on(`document`, async (msg) => {
      console.log(`-@ Generating docx for ${chalk.blueBright(`@${msg.chat.username}`)}`);
      // Проверка на наличие необходимой информации
      if (!this.isUserWithInfo(msg)) {
        await this.sendMessage(
          msg.chat.id,
          `Сначала укажите рост и вес \n\`/set 170 70\``,
          {parse_mode: `MarkdownV2`}
        );
        return;
      }

      const dir = `files/user/${msg.chat.id}` + ((msg.chat.username) ? `_${msg.chat.username}` : ``);

      console.log(dir);

      fs.access(dir, async (err) => {
        if (err) {
          await fs.promises.mkdir(dir);
        }
      });

      const filepath = await this.downloadFile(msg.document.file_id, `${dir}`);
      const file1 = await fs.promises.readFile(filepath);
      const file2 = await fs.promises.readFile(filepath);
      const zip1 = pizzip(file1);
      const zip2 = pizzip(file2);

      const docForTeacher = new Docxtemplater(zip1, {
        paragraphLoop: true,
        linebreaks: true,
      });

      const docForBot = new Docxtemplater(zip2, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // Первая колонка без текста
      let firstEmptyColumn = 1;
      while (docForBot.getFullText().indexOf(`{${firstEmptyColumn}_0_1}`) === -1) {
        firstEmptyColumn++;
        if (firstEmptyColumn > 100) {
          await this.sendMessage(
            msg.chat.id,
            `Ваш файл не является темплейтом. Скачайте пустой командой /template и отправьте его сюда. Если вы уже пользовались ботом, то отправьте последний next_template.docx`
          );
          return;
        }

      }

      docForTeacher.render({
        ...this.getRandomizedValues(firstEmptyColumn, `clear`),
        ...this.users.get(msg.chat.id).userAnswer ?? {},
        imt: this.users.get(msg.chat.id).imt,
      });

      docForBot.render({
        ...this.getRandomizedValues(firstEmptyColumn, `save`),
        ...this.users.get(msg.chat.id).userAnswer ?? {},
        imt: this.users.get(msg.chat.id).imt.toFixed(2)
      });


      const bufForTeacher = docForTeacher.getZip().generate({type: `nodebuffer`});
      const bufForBot = docForBot.getZip().generate({type: `nodebuffer`});

      await this.sendMessage(
        msg.chat.id,
        `Отправлять в мудл:`
      );
      await this.sendDocument(
        msg.chat.id,
        bufForTeacher,
        {},
        {filename: `Дневник самоконтроля.docx`}
      );

      await this.sendMessage(
        msg.chat.id,
        `Отправлять в бота для генерации следующего столбца:`
      );
      await this.sendDocument(
        msg.chat.id,
        bufForBot,
        {},
        {filename: `next_template.docx`}
      );

      // Удаляем скачанный файл
      await fs.promises.unlink(filepath);
    });
  }

  getRandomizedValues(column: number, mode: `clear` | `save`): Record<string, any> {
    const values = {
      ...this.getRandomizedValuesForColumn(column)
    };

    // Сгенерим все остальное
    for (let i = 1; i <= 26; i++) {
      if (i !== column) {
        for (let j = 0; j <= 10; j++) {
          for (let k = 1; k <= 4; k++) {
            if (mode === `clear`)
              values[`${i}_${j}_${k}`] = ``;
            else
              values[`${i}_${j}_${k}`] = `{${i}_${j}_${k}}`;
          }
        }
      }
    }

    return values;
  }

  getRandomizedValuesForColumn(column: number): Record<string, any> {
    const values = {};
    const date = moment().format(`DD.MM`);
    // Сгенерим все (todo переделать)
    const i = column;

    // Блоки
    let block = 0;

    // Дата
    values[`${i}_${block}_` + `1`] = date; // вдох
    block++;

    // Дл-ть задержки дыхания
    values[`${i}_${block}_` + `1`] = this.getRandomInt(25, 40); // вдох
    values[`${i}_${block}_` + `2`] = this.getRandomInt(25, 40); // выдох
    block++;

    // ЧСС
    values[`${i}_${block}_` + `1`] = this.getRandomInt(8, 12); // Ортостатическая проба
    values[`${i}_${block}_` + `2`] = this.getRandomInt(60, 70); // Одномоментная проба
    values[`${i}_${block}_` + `3`] = this.getRandomInt(2, 6); // Индекс Руфье
    values[`${i}_${block}_` + `4`] = 200; // Формула Шепарда
    block++;

    // Дата
    values[`${i}_${block}_` + `1`] = date;
    block++;

    // Общее сам-ие, настроение, сон, аппетит
    for (let j = 0; j < 4; j++) {
      if (Math.random() < 0.9) {
        values[`${i}_${block}_` + `1`] = `+`;
        values[`${i}_${block}_` + `2`] = ``;
      } else {
        values[`${i}_${block}_` + `1`] = ``;
        values[`${i}_${block}_` + `2`] = `+`;
      }
      values[`${i}_${block}_` + `3`] = ``;
      block++;
    }

    // Желание
    values[`${i}_${block}_` + `1`] = `+`;
    values[`${i}_${block}_` + `2`] = ``;
    block++;

    // Работоспособность
    values[`${i}_${block}_` + `1`] = `+`;
    values[`${i}_${block}_` + `2`] = ``;
    values[`${i}_${block}_` + `3`] = ``;
    block++;

    // б о л ь
    values[`${i}_${block}_` + `1`] = `+`;
    values[`${i}_${block}_` + `2`] = ``;
    block++;

    return values;
  }


  async init(): Promise<void> {
    try {
      await this.restoreIds();
      await this.restoreUserInfos();
    } catch (e) {
      if (e.message.includes(`ENOENT`)) {
        await this.saveIds();
        await this.saveUserInfos();
      } else {
        throw e;
      }
    }
  }

  private async restoreIds(): Promise<void> {
    this.chatIds = await readFile<Array<number>>(this.chatIdsFile,
      (str) => str
        .split(`\n`)
        .filter((item) => item.length > 0)
        .map((item) => parseInt(item))
    );
  }

  private async saveIds(): Promise<void> {
    await writeFile(this.chatIdsFile, this.chatIds.join(`\n`));
  }

  private async restoreUserInfos(): Promise<void> {
    this.users = new Map(Object.entries(await readFile(this.userInfosFile, (str) => JSON.parse(str))).map(
      (item) => [parseInt(item[0]), item[1]] as [number, UserInfo]
    ));
  }

  private async saveUserInfos(): Promise<void> {
    await writeFile(this.userInfosFile, JSON.stringify(Object.fromEntries(this.users)));
  }
}

export default TelegramClient;