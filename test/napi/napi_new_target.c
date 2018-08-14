#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include "common.h"

napi_value Construct(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));

  napi_value result;
  NAPI_CALL(env, napi_new_instance(env, argv[0], 0, NULL, &result));

  return result;
}

napi_value Klass(napi_env env, napi_callback_info info) {
  napi_value new_target;
  NAPI_CALL(env, napi_get_new_target(env, info, &new_target));
  bool is_constructor = (new_target != NULL);

  if (!is_constructor) {
    napi_throw_error(env, "NEQ", "expectation fail.");
  }

  return NULL;
}

napi_value Init(napi_env env, napi_value exports) {
  SET_NAMED_METHOD(env, exports, "Klass", Klass);
  SET_NAMED_METHOD(env, exports, "Construct", Construct);

  return exports;
}

NAPI_MODULE(napi_test, Init);
