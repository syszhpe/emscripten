/**
 * @license
 * Copyright 2010 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

// "use strict";

// General JS utilities - things that might be useful in any JS project.
// Nothing specific to Emscripten appears here.

function safeQuote(x) {
  return x.replace(/"/g, '\\"').replace(/'/g, "\\'");
}

function dump(item) {
  let funcData;
  try {
    if (typeof item == 'object' && item != null && item.funcData) {
      funcData = item.funcData;
      item.funcData = null;
    }
    return '// ' + JSON.stringify(item, null, '  ').replace(/\n/g, '\n// ');
  } catch (e) {
    const ret = [];
    for (const [i, j] of Object.entries(item)) {
      if (typeof j == 'string' || typeof j == 'number') {
        ret.push(`${i}: ${j}`);
      } else {
        ret.push(`${i}: [?]`);
      }
    }
    return ret.join(',\n');
  } finally {
    if (funcData) item.funcData = funcData;
  }
}

globalThis.warnings = false;
globalThis.currentFile = null;

function errorPrefix() {
  if (currentFile) {
    return currentFile + ': '
  } else {
    return '';
  }
}

function warn(a, msg) {
  globalThis.warnings = true;
  if (!msg) {
    msg = a;
    a = false;
  }
  if (!a) {
    printErr(`warning: ${errorPrefix()}${msg}`);
  }
}

function warnOnce(a, msg) {
  if (!msg) {
    msg = a;
    a = false;
  }
  if (!a) {
    if (!warnOnce.msgs) warnOnce.msgs = {};
    if (msg in warnOnce.msgs) return;
    warnOnce.msgs[msg] = true;
    warn(msg);
  }
}

globalThis.abortExecution = false;

function error(msg) {
  abortExecution = true;
  printErr(`error: ${errorPrefix()}${msg}`);
}

function range(size) {
  return Array.from(Array(size).keys());
}

function bind(self, func) {
  return function(...args) {
    func.apply(self, args);
  };
}

function sum(x) {
  return x.reduce((a, b) => a + b, 0);
}

// options is optional input object containing mergeInto params
// currently, it can contain
//
// key: noOverride, value: true
// if it is set, it prevents symbol redefinition and shows error
// in case of redefinition
//
// key: checkSig, value: true
// if it is set, __sig is checked for functions and error is reported
// if <function name>__sig is missing
function addToLibrary(obj, options = null) {
  mergeInto(LibraryManager.library, obj, options);
}

function mergeInto(obj, other, options = null) {
  if (options) {
    // check for unintended symbol redefinition
    if (options.noOverride) {
      for (const key of Object.keys(other)) {
        if (obj.hasOwnProperty(key)) {
          error(`Symbol re-definition in JavaScript library: ${key}. Do not use noOverride if this is intended`);
          return;
        }
      }
    }

    // check if sig is missing for added functions
    if (options.checkSig) {
      for (const [key, value] of Object.entries(other)) {
        if (typeof value === 'function' && !other.hasOwnProperty(key + '__sig')) {
          error(`__sig is missing for function: ${key}. Do not use checkSig if this is intended`);
          return;
        }
      }
    }
  }

  if (!options || !options.allowMissing) {
    for (const ident of Object.keys(other)) {
      if (isDecorator(ident)) {
        const index = ident.lastIndexOf('__');
        const basename = ident.slice(0, index);
        if (!(basename in obj) && !(basename in other)) {
          error(`Missing library element '${basename}' for library config '${ident}'`);
        }
      }
    }
  }

  for (const key of Object.keys(other)) {
    if (isDecorator(key)) {
      if (key.endsWith('__sig')) {
        if (obj.hasOwnProperty(key)) {
          const oldsig = obj[key];
          const newsig = other[key];
          if (oldsig == newsig) {
            warn(`signature redefinition for: ${key}`);
          } else {
            error(`signature redefinition for: ${key}. (old=${oldsig} vs new=${newsig})`);
          }
        }
      }

      const index = key.lastIndexOf('__');
      const decoratorName = key.slice(index);
      const type = typeof other[key];

      // Specific type checking for `__deps` which is expected to be an array
      // (not just any old `object`)
      if (decoratorName === '__deps') {
        const deps = other[key];
        if (!Array.isArray(deps)) {
          error(`JS library directive ${key}=${deps.toString()} is of type '${type}', but it should be an array`);
        }
        for (let dep of deps) {
          if (dep && typeof dep !== 'string' && typeof dep !== 'function') {
            error(`__deps entries must be of type 'string' or 'function' not '${typeof dep}': ${key}`)
          }
        }
      } else {
        // General type checking for all other decorators
        const decoratorTypes = {
          '__sig': 'string',
          '__proxy': 'string',
          '__asm': 'boolean',
          '__inline': 'boolean',
          '__postset': ['string', 'function'],
          '__docs': 'string',
          '__nothrow': 'boolean',
          '__noleakcheck': 'boolean',
          '__internal': 'boolean',
          '__user': 'boolean',
          '__async': 'boolean',
          '__i53abi': 'boolean',
        };
        const expected = decoratorTypes[decoratorName];
        if (type !== expected && !expected.includes(type)) {
          error(`Decorator (${key}} has wrong type. Expected '${expected}' not '${type}'`);
        }
      }
    }
  }

  return Object.assign(obj, other);
}

function isNumber(x) {
  // XXX this does not handle 0xabc123 etc. We should likely also do x == parseInt(x) (which handles that), and remove hack |// handle 0x... as well|
  return x == parseFloat(x) || (typeof x == 'string' && x.match(/^-?\d+$/)) || x == 'NaN';
}

// Symbols that start with '$' are not exported to the wasm module.
// They are intended to be called exclusively by JS code.
function isJsOnlySymbol(symbol) {
  return symbol[0] == '$';
}

function isDecorator(ident) {
  suffixes = [
    '__sig',
    '__proxy',
    '__asm',
    '__inline',
    '__deps',
    '__postset',
    '__docs',
    '__nothrow',
    '__noleakcheck',
    '__internal',
    '__user',
    '__async',
    '__i53abi',
  ];
  return suffixes.some((suffix) => ident.endsWith(suffix));
}

function isPowerOfTwo(x) {
  return x > 0 && ((x & (x - 1)) == 0);
}

/** @constructor */
globalThis.Benchmarker = function() {
  const totals = {};
  const ids = [];
  const lastTime = 0;
  this.start = function(id) {
    const now = Date.now();
    if (ids.length > 0) {
      totals[ids[ids.length - 1]] += now - lastTime;
    }
    lastTime = now;
    ids.push(id);
    totals[id] = totals[id] || 0;
  };
  this.stop = function(id) {
    const now = Date.now();
    assert(id === ids[ids.length - 1]);
    totals[id] += now - lastTime;
    lastTime = now;
    ids.pop();
  };
  this.print = function(text) {
    const ids = Object.keys(totals);
    if (ids.length > 0) {
      ids.sort((a, b) => totals[b] - totals[a]);
      printErr(text + ' times: \n' + ids.map((id) => id + ' : ' + totals[id] + ' ms').join('\n'));
    }
  };
}
