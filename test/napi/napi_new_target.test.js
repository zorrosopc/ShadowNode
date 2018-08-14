var assert = require('assert')
var napi_test = require('./build/Release/napi_new_target.node')

assert(napi_test !== null);
assert.strictEqual(typeof napi_test, 'object')

assert.strictEqual(typeof napi_test.Klass, 'function')

function JSKlass() {
  assert(this instanceof JSKlass)
}


assert.doesNotThrow(() => { new JSKlass() }, 'new.target shall exists on js new JS Klass')
assert.doesNotThrow(() => { napi_test.Construct(JSKlass) }, 'new.target shall exists on jerry construct JS Klass')
assert.doesNotThrow(() => { new napi_test.Klass() }, 'new.target shall exists on js new C Klass')
assert.doesNotThrow(() => { napi_test.Construct(napi_test.Klass) }, 'new.target shall exists on jerry construct C Klass')
