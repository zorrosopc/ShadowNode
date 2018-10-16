/**
ffi module
*/
var ffi = exports;
var bindings = native;
var debug = require('debug')('ffi');
var assert = require('assert');

/******************************************************************************************/


/******************************************************************************************/
function isInteger(value) {
  return typeof value === 'number' &&
    isFinite(value) &&
    Math.floor(value) === value
}

/******************************************************************************************/
var Types = {
  'void *': {
    size: bindings.Constant.POINTER_SIZE
  },
  'pointer': {
    size: bindings.Constant.POINTER_SIZE
  },
  'void': {
    size: 1
  },
  'int8': {
    size: 1
  },
  'uint8': {
    size: 1
  },
  'int16': {
    size: 2
  },
  'uint16': {
    size: 2
  },
  'int32': {
    size: 4
  },
  'uint32': {
    size: 4
  },
  'int64': {
    size: 8
  },
  'uint64': {
    size: 8
  },
  'float': {
    size: 4
  },
  'double': {
    size: 8
  },
  'char *': {
    size: bindings.Constant.POINTER_SIZE
  },
  'string': {
    size: bindings.Constant.POINTER_SIZE
  },
  'bool': {
    size: 1
  },
  'char': {
    size: 1
  },
  'uchar': {
    size: 1
  },
  'short': {
    size: 2
  },
  'ushort': {
    size: 2
  },
  'int': {
    size: bindings.Constant.INT_SIZE
  },
  'uint': {
    size: bindings.Constant.INT_SIZE
  },
  'long': {
    size: bindings.Constant.LONG_SIZE
  },
  'ulong': {
    size: bindings.Constant.LONG_SIZE
  },
  'size_t': {
    size: bindings.Constant.SIZE_T_SIZE
  }
}

function getSizeOf (type) {
  var descriptor = Types[type]
  if (descriptor == null) {
    throw new Error('Unknown type ' + type)
  }
  return descriptor.size
}

//module.exports.Types = Types;
//module.exports.getSizeOf = getSizeOf;
/******************************************************************************************/
var castToCHandlers = {
  'double': checkNil(bindings.wrap_number_value),
  'int': checkNil(bindings.wrap_int_value),
  'string': nullOrValue(bindings.wrap_string_value),
  'pointer': nullOrValue(it => {
    if (it instanceof ffi.Callback) {
      it = it._codePtr
    }
    if (it instanceof AStruct) {
      it = it._ptr
    }
    return bindings.wrap_pointers(1, it)
  })
}

var castToJsHandlers = {
  'void': () => null,
  'double': bindings.deref_number_pointer,
  'int': bindings.deref_int_pointer,
  'string': bindings.deref_string_pointer,
  'pointer': bindings.deref_pointer_pointer
}

var writeHandler = {
  'double': writeHandlerTypeWrapper('number', bindings.write_number_value),
  'int': writeHandlerTypeWrapper(isInteger, bindings.write_int_value),
  'string': writeHandlerTypeWrapper('string', bindings.write_string_value),
  'pointer': writeHandlerTypeWrapper(Buffer.isBuffer, bindings.write_pointer_value)
}

;[
  [ 'void *', 'pointer' ],
  [ 'integer', 'int' ],
  [ 'number', 'double' ]
].forEach(aliasMap => {
  castToCHandlers[aliasMap[0]] = castToCHandlers[aliasMap[1]]
  castToJsHandlers[aliasMap[0]] = castToJsHandlers[aliasMap[1]]
  writeHandler[aliasMap[0]] = writeHandler[aliasMap[1]]
})

function checkNil (binding) {
  return function conversion (value) {
    if (value == null) {
      throw new Error('Unexpected nil on before conversion hook')
    }
    return binding(value)
  }
}

function writeHandlerTypeWrapper (type, binding) {
  return function writeWrapper (pointer, offset, value) {
    if (typeof type === 'function') {
      assert(type(value), 'Failed type assertion on casting JS value to C types')
    } else {
      assert.strictEqual(typeof value, type, 'Expect a/an ' + type + ', but got a/an ' + typeof value)
    }
    // Some writes may allocated new memory blocks, which shall be bound to parent pointer's life cycle
    var ret = binding(pointer, offset, value)
    if (ret) {
      pointer[offset] = ret
    }
    return ret
  }
}

function nullOrValue (binding) {
  return function conversion (value) {
    if (value == null) {
      return bindings.alloc_pointer()
    }
    return binding(value)
  }
}

/**
 *
 * @param {string} type
 * @param {any} value
 */
function castToCType (type, value) {
  if (value === undefined) {
    throw new Error('Unexpected undefined on casting to c type')
  }
  var handler = castToCHandlers[type]
  if (handler == null) {
    throw new Error('type ' + type + ' is not supported yet')
  }
  var buf = handler(value)
  buf._type = type
  return buf
}

/**
 *
 * @param {string[]} types
 * @param {ArrayLike} values
 */
function castToCTypeFromArray (types, values) {
  return types.map((type, idx) => {
    var val = values[idx]
    return castToCType(type, val)
  })
}

/**
 *
 * @param {string} type
 * @param {Buffer} ptr
 * @param {number} [offset]
 */
function castToJSType (type, ptr, offset) {
  if (ptr == null) {
    throw new Error('Unexpected nil on casting to js type')
  }
  var handler = castToJsHandlers[type]
  if (handler == null) {
    throw new Error('type ' + type + ' is not supported yet')
  }
  return handler(ptr, offset)
}

/**
 *
 * @param {string[]} types
 * @param {ArrayLike} ptrs
 */
function castToJSTypeFromArray (types, ptrs) {
  return types.map((type, idx) => {
    var val = ptrs[idx]
    if (val == null) {
      throw new Error('Unexpected nil on casting to js type')
    }
    return castToJSType(type, val)
  })
}

function writeTo (type, ptr, offset, value) {
  if (ptr == null) {
    throw new Error('Unexpected nil on casting to js type')
  }
  var handler = writeHandler[type]
  if (handler == null) {
    throw new Error('type ' + type + ' is not supported yet')
  }
  return handler(ptr, offset, value)
}

//module.exports.castToCType = castToCType;
//module.exports.castToCTypeFromArray = castToCTypeFromArray;
//module.exports.castToJSType = castToJSType;
//module.exports.castToJSTypeFromArray = castToJSTypeFromArray;
//module.exports.writeTo = writeTo;

/********************************************************************************************/
function AStruct () {

}
/**
 *
 * @param {[string, string][]} members
 */
function StructClassConstructor (members) {
  assert(Array.isArray(members))
  var keys = members.map(it => it[0])
  var types = members.map(it => it[1])
  var typeSizes = types.map(definition.getSizeOf)
  var alignment = Struct.alignment = typeSizes.reduce((accu, curr) => accu > curr ? accu : curr, 0)
  var size = Struct.size = typeSizes.reduce((accu, curr) => accu + (curr < alignment ? alignment : curr), 0)
  Struct.packed = false
  debug('Create size(' + size + ')/alignment(' + alignment + ') struct with members', members)

  var properties = {}
  keys.forEach((key, idx) => {
    properties[key] = {
      enumerable: true,
      configurable: true,
      get: function get () {
        var offset = alignment * idx
        debug('get a field:', key, 'offset', offset)
        return castToJSType(types[idx], this._ptr, offset)
      },
      set: function set (val) {
        var offset = alignment * idx
        debug('set a field:', key, 'offset', offset)
        writeTo(types[idx], this._ptr, offset, val)
      }
    }
  })

  util.inherits(Struct, AStruct)
  return Struct

  /**
   *
   * @param {object} fields
   * @param {object} [opts]
   * @param {Buffer} [opts.ptr] pre-initialized underlying memory block pointer
   */
  function Struct (fields, opts) {
    debug('instantiate a struct with fields', fields)
    opts = Object.assign({}, opts)
    if (opts.ptr && Buffer.isBuffer(opts.ptr)) {
      this._ptr = opts.ptr
    } else {
      this._ptr = bindings.alloc(size)
    }

    Object.defineProperties(this, properties)
    if (fields) {
      Object.keys(fields).forEach(key => {
        this[key] = fields[key]
      })
    }
  }
}

//module.exports = StructClassConstructor
//module.exports.AStruct = AStruct
/******************************************************************************************/
/**
 *
 * @param {string} retType
 * @param {string[]} argsTypes
 * @param {number} abi
 */
function CIF (retType, argsTypes, abi) {
  assert(typeof retType === 'string')
  assert(Array.isArray(argsTypes))
  argsTypes.forEach((it, idx) => assert(typeof it === 'string', 'item ' + idx + ' of argsTypes shall be a string, got' + typeof it))

  var numOfArgs = this.numOfArgs = argsTypes.length
  this.retType = retType
  this.argsTypes = argsTypes

  var cifPtr = Buffer.alloc(8, 0)
  var status = bindings.ffi_prep_cif(cifPtr, numOfArgs, retType, argsTypes)
  if (status !== 0) {
    throw new Error('Prepare CIF failed for errno ' + status)
  }
  this._cifPtr = cifPtr
}
//module.exports = CIF;
//module.exports.CIF = CIF;
/********************************************************************************************/
/**
 *
 * @param {string} retType
 * @param {string[]} argsTypes
 * @param {Function} fn
 */
ffi.Callback = function (retType, argsTypes, fn) {
  if (!(this instanceof ffi.Callback)) {
    return new ffi.Callback(retType, argsTypes, fn)
  }

  assert(typeof fn === 'function')
  debug('creating callback', retType, argsTypes, fn)

  var cif = this._cif = new CIF(retType, argsTypes)

  function callbackProxy () {
    debug('callback proxy being called, casting arguments')
    var argsArr = arguments
    try {
      argsArr = castToJSTypeFromArray(cif.argsTypes, argsArr)
    } catch (err) {
      console.error('Unexpected error on casting callback arguments', err)
      throw err
    }

    var ret
    try {
      debug('calling actual callback function with arguments', argsArr)
      ret = fn.apply(null, argsArr)
    } catch (err) {
      console.log('Unexpected error on calling callback', err)
      throw err
    }
    debug('callback executed')
    return ret
  }

  var closurePtr = this._closurePtr = bindings.wrap_callback(cif._cifPtr, callbackProxy)
  this._codePtr = bindings.get_callback_code_loc(closurePtr)
  this._proxy = callbackProxy

  debug('created callback')
}
//module.exports = Callback;
//module.exports.Callback = Callback;

/********************************************************************************************/
ffi.ForeignFunction = function (fnPtr, retType, argsTypes, abi) {
  var callbackObject
  if (fnPtr instanceof ffi.Callback) {
    callbackObject = fnPtr
    fnPtr = fnPtr._codePtr
  }
  debug('ForeignFunction()')
  assert(Buffer.isBuffer(fnPtr), 'expected Buffer as first argument')
  assert(typeof retType === 'string', 'expected a return "type" string as the second argument')
  assert(Array.isArray(argsTypes), 'expected Array of arg "type" string as the third argument')

  var numOfArgs = argsTypes.length
  var cif = new CIF(retType, argsTypes, abi)
  debug('ForeignFunction - cif')
  function proxy () {
    debug('ForeignFunction - proxy')
    var retPtr = bindings.alloc(getSizeOf(retType))
    var argsArr = castToCTypeFromArray(cif.argsTypes, arguments)
    var argsPtr = bindings.wrap_pointers.apply(null, [ cif.numOfArgs ].concat(argsArr))

    debug('invoke foreign function')
    bindings.ffi_call(cif._cifPtr, fnPtr, retPtr, argsPtr)

    debug('invoked foreign function, casting return value')
    var retVal = castToJSType(cif.retType, retPtr)
    return retVal
  }

  /**
   * The asynchronous version of the proxy function.
   */

  proxy.async = function async () {
    debug('invoking async proxy function')
    assert.strictEqual(arguments.length, numOfArgs + 1, 'expected ' + (numOfArgs + 1) + ' arguments')
    var callback = arguments[numOfArgs]
    assert.strictEqual(typeof callback, 'function', 'expect a function as the last argument of async call')

    // Allocates appropriate memory block used in ffi call
    var retPtr = bindings.alloc(Types.getSizeOf(retType))
    var argsArr = castToCTypeFromArray(cif.argsTypes, Array.prototype.slice.call(arguments, 0, -1))
    var argsPtr = bindings.wrap_pointers.apply(null, [ cif.numOfArgs ].concat(argsArr))

    /**
     * A callback proxy, shall be called exactly once
     * @param {Error} err
     */
    function callbackProxy (err) {
      if (err) {
        debug('on async callback error', err)
        callback(err)
        return
      }
      debug('on async ffi call succeeded, casting return value')
      var retVal = castToJSType(cif.retType, retPtr)
      debug('calling actual callback function')
      try {
        callback(null, retVal)
      } catch (err) {
        console.error('ffi: unexpected error on calling async callback', err)
      }
    }
    callbackProxy._callback = fnPtr
    callbackProxy._callbackObject = callbackObject
    callbackProxy.argsArr = argsArr
    callbackProxy.argsPtr = argsPtr

    bindings.ffi_call_async(cif._cifPtr, fnPtr, retPtr, argsPtr, callbackProxy)
  }

  return proxy
}
//module.exports = ForeignFunction;
//module.exports.ForeignFunction = ForeignFunction;
/******************************************************************************************/
var dlopen = ffi.ForeignFunction(bindings.dlopen, 'pointer', [ 'string', 'int' ]);
var dlclose = ffi.ForeignFunction(bindings.dlclose, 'int', [ 'pointer' ]);
var dlsym = ffi.ForeignFunction(bindings.dlsym, 'pointer', [ 'pointer', 'string' ]);
var dlerror = ffi.ForeignFunction(bindings.dlerror, 'string', [ ]);

/**
 * `DynamicLibrary` loads and fetches function pointers for dynamic libraries
 * (.so, .dylib, etc). After the libray's function pointer is acquired, then you
 * call `get(symbol)` to retreive a pointer to an exported symbol. You need to
 * call `get___()` on the pointer to dereference it into its actual value, or
 * turn the pointer into a callable function with `ForeignFunction`.
 */
function DynamicLibrary (path, mode) {
  if (!(this instanceof DynamicLibrary)) {
    return new DynamicLibrary(path, mode)
  }
  debug('new DynamicLibrary() path:'+ path + " mode:" + mode)

  if (mode == null) {
    mode = DynamicLibrary.FLAGS.RTLD_LAZY
  }
  debug('-----dlopen-------:'+typeof dlopen);
  this._handle = dlopen(path, mode);
  debug('-----isBuffer-------');
  assert(Buffer.isBuffer(this._handle), 'expected a Buffer instance to be returned from `dlopen()`')
  debug('opened library', path)

  if (bindings.is_pointer_null(this._handle)) {
    var err = this.error()

    throw new Error('Dynamic Linking Error: ' + err)
  }
}


/**
 * Set the exported flags from "dlfcn.h"
 */
DynamicLibrary.FLAGS = {}
Object.keys(bindings).forEach(function (k) {
  if (!/^RTLD_/.test(k)) {
    return
  }
  var desc = Object.getOwnPropertyDescriptor(bindings, k)
  Object.defineProperty(DynamicLibrary.FLAGS, k, desc)
})

/**
 * Close this library, returns the result of the dlclose() system function.
 */
DynamicLibrary.prototype.close = function () {
  debug('dlclose()')
  return dlclose(this._handle)
}

/**
 * Get a symbol from this library, returns a Pointer for (memory address of) the symbol
 */
DynamicLibrary.prototype.get = function (symbol) {
  debug('dlsym()', symbol)
  assert.equal('string', typeof symbol)

  var ptr = dlsym(this._handle, symbol)
  assert(Buffer.isBuffer(ptr))

  if (bindings.is_pointer_null(ptr)) {
    throw new Error('Dynamic Symbol Retrieval Error: ' + this.error())
  }

  ptr.name = symbol

  return ptr
}

/**
 * Returns the result of the dlerror() system function
 */
DynamicLibrary.prototype.error = function error () {
  debug('dlerror()')
  return dlerror()
}
//module.exports = DynamicLibrary;
//module.exports.DynamicLibrary = DynamicLibrary;
/******************************************************************************************/
var RTLD_NOW = DynamicLibrary.FLAGS.RTLD_NOW;

/**
 * The extension to use on libraries.
 * i.e.  libm  ->  libm.so   on linux
 */
var EXT = {
  'linux': '.so',
  'linux2': '.so',
  'sunos': '.so',
  'solaris': '.so',
  'freebsd': '.so',
  'openbsd': '.so',
  'darwin': '.dylib',
  'mac': '.dylib',
  'win32': '.dll'
}[process.platform]

/**
 * Provides a friendly abstraction/API on-top of DynamicLibrary and
 * ForeignFunction.
 */
ffi.Library = function(libfile, funcs, lib) {
  debug('creating Library object for', libfile)

  if (libfile && libfile.indexOf(EXT) === -1) {
    debug('appending library extension to library name '+EXT)
    libfile += EXT
  }

  if (!lib) {
    lib = {}
  }
  var dl = new DynamicLibrary(libfile || null, RTLD_NOW)

  Object.keys(funcs || {}).forEach(function (func) {
    debug('defining function', func)

    var fptr = dl.get(func)
    var info = funcs[func]

    if (bindings.is_pointer_null(fptr)) {
      throw new Error('Library: "' + libfile +
        '" returned NULL function pointer for "' + func + '"')
    }

    var resultType = info[0]
    var paramTypes = info[1]
    var fopts = info[2]
    var abi = fopts && fopts.abi
    var async = fopts && fopts.async

    var ff = ffi.ForeignFunction(fptr, resultType, paramTypes, abi)
    lib[func] = async ? ff.async : ff
  })

  return lib
}

/******************************************************************************************/

//module.exports.isPointerNull = bindings.is_pointer_null
//module.exports.allocPointer = bindings.alloc_pointer
//module.exports.alloc = bindings.alloc
//module.exports.derefPointerPointer = bindings.deref_pointer_pointer


