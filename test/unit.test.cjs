const {test} = require('node:test');
const assert = require('node:assert/strict');
const {OutWestSepticQuoteForm: Form} = require('../script.js');
const config = require('../form-config.json');
function request(overrides = {}) {
  const data = new URLSearchParams({name:' Test lead ', phone:'555-0100', email:'test@example.invalid', address:'Synthetic property', county:'Palo Pinto', home_status:'New construction', ...overrides});
  data.append('service', 'New conventional system');
  return data;
}

test('delivery configuration is explicit and preserves the chosen recipient', () => {
  assert.equal(Form.validateConfig(config).recipient_email, 'sales@outwestseptic.com');
  assert.equal(Form.validateConfig({submit_mode:'mailto', recipient_email:'chosen@example.invalid'}).recipient_email, 'chosen@example.invalid');
  for (const value of [null, {}, {submit_mode:'unknown'}, {submit_mode:'webhook', webhook_url:''}, {submit_mode:'mailto', recipient_email:'x@example.invalid?bcc=other@example.invalid'}]) assert.throws(() => Form.validateConfig(value));
});
test('webhooks require HTTPS without credentials or fragments', () => {
  for (const url of ['http://example.invalid/', 'javascript:alert(1)', 'https://user:secret@example.invalid/', 'https://example.invalid/#private']) assert.throws(() => Form.validateConfig({submit_mode:'webhook', webhook_url:url}));
  assert.equal(Form.validateConfig({submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'}).webhook_url, 'https://forms.example.invalid/inbox');
});
test('required whitespace and excluded counties cannot produce requests', () => {
  for (const values of [{name:'   '}, {phone:' '}, {address:'\n'}, {county:'Parker'}, {county:'Tarrant'}, {home_status:'unexpected'}]) assert.throws(() => Form.readRequest(request(values)));
});
test('services are complete, deduplicated, and whitelisted', () => {
  const data = request();
  data.append('service', 'Inspection'); data.append('service', 'Inspection'); data.append('unlisted', 'secret');
  const parsed = Form.readRequest(data);
  assert.deepEqual(parsed.services, ['New conventional system', 'Inspection']);
  assert.equal(parsed.name, 'Test lead'); assert.equal(parsed.unlisted, undefined);
  data.append('service', 'unlisted service'); assert.throws(() => Form.readRequest(data));
  data.delete('service'); assert.throws(() => Form.readRequest(data));
});
test('bedrooms accept only optional whole numbers within the published bounds', () => {
  for (const bedrooms of ['', '1', '10']) assert.doesNotThrow(() => Form.readRequest(request({bedrooms})));
  for (const bedrooms of ['0', '11', '-1', '2.5', '1e1', 'Infinity']) assert.throws(() => Form.readRequest(request({bedrooms})));
});
test('length limits reject requests rather than silently truncate information', () => {
  assert.equal(Form.readRequest(request({notes:'x'.repeat(5000)})).notes.length, 5000);
  assert.throws(() => Form.readRequest(request({notes:'x'.repeat(5001)})));
  assert.throws(() => Form.readRequest(request({name:'x'.repeat(121)})));
});
test('mailto escapes reserved text and retains Unicode and all selected topics', () => {
  const data = request({name:'Test & <b>lead</b>', notes:'Unicode: café\n&bcc=other@example.invalid # ?'});
  data.append('service', 'Inspection');
  const parsed = Form.readRequest(data);
  const url = new URL(Form.mailto({recipient_email:'chosen@example.invalid'}, parsed));
  assert.equal(url.searchParams.get('body'), Form.buildMessage(parsed));
  assert.equal(url.searchParams.get('bcc'), null);
  assert.match(url.searchParams.get('body'), /New conventional system, Inspection/);
  assert.ok(url.searchParams.get('body').includes('café'));
});
