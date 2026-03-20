import { translations } from './i18n';

const enKeys = Object.keys(translations.en);
const bemKeys = Object.keys(translations.bem);

const missingKeysWithValues: Record<string, any> = {};
enKeys.forEach(key => {
  if (!bemKeys.includes(key)) {
    const value = translations.en[key];
    if (typeof value === 'function') {
      missingKeysWithValues[key] = value.toString();
    } else {
      missingKeysWithValues[key] = value;
    }
  }
});

console.log(JSON.stringify(missingKeysWithValues, null, 2));
