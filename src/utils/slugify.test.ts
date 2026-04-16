import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import slugify from './slugify';

test('converte "Ciao Mondo" in "ciao-mondo"', () => {
  assert.equal(slugify('Ciao Mondo'), 'ciao-mondo');
});

test('rimuove accenti e apostrofi da "Città più bella d\'Italia"', () => {
  assert.equal(slugify("Città più bella d'Italia"), 'citta-piu-bella-ditalia');
});

test('collassa spazi multipli e trimma "   spazi   multipli   "', () => {
  assert.equal(slugify('   spazi   multipli   '), 'spazi-multipli');
});

test('tronca stringhe più lunghe di 60 caratteri', () => {
  const long = 'a'.repeat(80);
  const result = slugify(long);
  assert.equal(result.length, 60);
  assert.equal(result, 'a'.repeat(60));
});
