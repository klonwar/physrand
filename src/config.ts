import pjson from "#root/package.json";
import {StateItem} from "#src/core/state-item";

export const BOT_NAME = `- VSU PhysRand v${pjson.version} -`;

export const TELEGRAM_CONFIG = {
  createTitle: (item: StateItem): string => item.info.title.replace(/Объявление/, ``) + ` - ${item.info.price}`,
  helpMessage: `Я заполню ваш дневник самоконтроля рандомными данными.\n`+
    `\n\n` +
    `1. Сообщите боту ваш рост и вес (/set 170 70). Округлить нужно до целого. Рассчитается ИМТ, относительно которого будут рандомизироваться данные\n` +
    `2. Скачайте файл дневника командой /template\n` +
    `3. Заполните в документе ФИО, факультет, курс, группу (поле сверху)\n` +
    `4. Отправьте его сюда. Бот пришлет целиком заполненную таблицу. Сохраните ее себе куда-нибудь, и очищайте ее на нужное количество столбцов`
};