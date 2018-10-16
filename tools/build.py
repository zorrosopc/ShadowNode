#!/usr/bin/env python

# Copyright 2015-present Samsung Electronics Co., Ltd. and other contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import print_function
try:
    basestring
except:
    # in Python 3.x there is no basestring just str
    basestring = str

import argparse
import json
import sys
import re
import os
import glob

from common_py import path
from common_py.system.filesystem import FileSystem as fs
from common_py.system.executor import Executor as ex
from common_py.system.platform import Platform

platform = Platform()

# Initialize build options.
def init_options():
    # Check config options.
    arg_config = list(filter(lambda x: x.startswith('--config='), sys.argv))
    config_path = path.BUILD_CONFIG_PATH

    if arg_config:
        config_path = arg_config[-1].split('=', 1)[1]

    build_config = {}
    with open(config_path, 'rb') as f:
        build_config = json.loads(f.read().decode('ascii'))

    # Read config file and apply it to argv.
    argv = []

    list_with_commas = ['external-modules']

    for opt_key in build_config:
        opt_val = build_config[opt_key]
        if (opt_key in list_with_commas) and isinstance(opt_val, list):
            opt_val and argv.append('--%s=%s' % (opt_key, ','.join(opt_val)))
        elif isinstance(opt_val, basestring) and opt_val != '':
            argv.append('--%s=%s' % (opt_key, opt_val))
        elif isinstance(opt_val, bool):
            if opt_val:
                argv.append('--%s' % opt_key)
        elif isinstance(opt_val, int):
            argv.append('--%s=%s' % (opt_key, opt_val))
        elif isinstance(opt_val, list):
            for val in opt_val:
                argv.append('--%s=%s' % (opt_key, val))

    # Apply command line argument to argv.
    argv = argv + sys.argv[1:]

    # Prepare argument parser.
    parser = argparse.ArgumentParser()

    parser.add_argument('--buildtype',
        choices=['debug', 'release'], default='debug',
        help='Specify the build type: %(choices)s (default: %(default)s)')

    parser.add_argument('--builddir', default=path.BUILD_ROOT,
        help='Specify the build directory (default: %(default)s)')

    parser.add_argument('--buildlib', action='store_true', default=False,
        help='Build IoT.js library only (default: %(default)s)')

    parser.add_argument('--install', action='store_true', default=False,
        help='Install IoT.js binary/library/headers')

    parser.add_argument('--install-prefix', default='/usr/local',
        help='Select the install prefix (default: %(default)s)')

    parser.add_argument('--clean', action='store_true', default=False,
        help='Clean build directory before build (default: %(default)s)')

    parser.add_argument('--config', default=path.BUILD_CONFIG_PATH,
        help='Specify the config file (default: %(default)s)',
        dest='config_path')

    parser.add_argument('--disable-es2015', default=False,
        help='Specify if ES2015 enabled (default: %(default)s)',
        dest='disable_es2015')

    parser.add_argument('--profile',
        help='Specify the module profile file for IoT.js')

    parser.add_argument('--target-arch',
        choices=['aarch64', 'arm', 'openwrt', 'x86', 'i686', 'x86_64', 'x64', 'mipsel'],
        default=platform.arch(),
        help='Specify the target architecture: '
             '%(choices)s (default: %(default)s)')
    parser.add_argument('--target-os',
        choices=['linux', 'darwin', 'osx', 'nuttx', 'tizen', 'tizenrt'],
        default=platform.os(),
        help='Specify the target os: %(choices)s (default: %(default)s)')

    parser.add_argument('--target-board',
        choices=[None, 'artik10', 'stm32f4dis', 'rpi2', 'artik05x'],
        default=None, help='Specify the target board (if needed): '
             '%(choices)s (default: %(default)s)')
    parser.add_argument('--nuttx-home', default=None, dest='sysroot',
        help='Specify the NuttX base directory (required for NuttX build)')

    parser.add_argument('--sysroot', action='store',
        help='The location of the development tree root directory (sysroot).'
        'Must be compatible with used toolchain.')

    parser.add_argument('--cmake-param',
        action='append', default=[],
        help='Specify additional cmake parameters '
             '(can be used multiple times)')
    parser.add_argument('--compile-flag',
        action='append', default=[],
        help='Specify additional compile flags (can be used multiple times)')
    parser.add_argument('--link-flag',
        action='append', default=[],
        help='Specify additional linker flags (can be used multiple times)')

    parser.add_argument('--external-include-dir',
        action='append', default=[],
        help='Specify additional external include directory '
             '(can be used multiple times)')
    parser.add_argument('--external-lib',
        action='append', default=[],
        help='Specify additional external library '
             '(can be used multiple times)')

    parser.add_argument('--external-modules',
        action='store', default=set(), type=lambda x: set(x.split(',')),
        help='Specify the path of modules.json files which should be processed '
             '(format: path1,path2,...)')

    parser.add_argument('--jerry-cmake-param',
        action='append', default=[],
        help='Specify additional cmake parameters for JerryScript '
        '(can be used multiple times')
    parser.add_argument('--jerry-compile-flag',
        action='append', default=[],
        help='Specify additional compile flags for JerryScript '
             '(can be used multiple times')
    parser.add_argument('--jerry-lto',
        action='store_true', default=False,
        help='Build JerryScript with LTO enabled')
    parser.add_argument('--jerryx',
        action='store_true', default=False,
        help='Build ShadowNode with JerryX')

    parser.add_argument('--jerry-heap-section',
        action='store', default=None,
        help='Specify the name of the JerryScript heap section')
    parser.add_argument('--jerry-heaplimit',
        type=int, default=build_config['jerry-heaplimit'],
        help='Specify the size of the JerryScript max heap size '
             '(default: %(default)s)')

    parser.add_argument('--jerry-memstat',
        action='store_true', default=False,
        help='Enable JerryScript heap statistics')
    parser.add_argument('--jerry-cpu-profiler',
        action='store_true', default=False,
        help='Enable JerryScript CPU profiler')
    parser.add_argument('--jerry-heap-profiler',
        action='store_true', default=False,
        help='Enable JerryScript Heap profiler')
    parser.add_argument('--jerry-function-name',
        action='store_true', default=False,
        help='Enable saving Javascript function name')

    parser.add_argument('--jerry-profile',
        choices=['es5.1', 'es2015-subset'], default='es5.1',
        help='Specify the profile for JerryScript: %(choices)s'
             ' (default: %(default)s)')
    parser.add_argument('--jerry-debugger',
        action='store_true', default=False,
        help='Enable JerryScript-debugger')

    parser.add_argument('--napi',
        action='store_true', default=False,
        help='Build ShadowNode with N-API enabled')

    # Unit testing and benchmarking options
    parser.add_argument('--run-test',
        nargs='?', default=False, const="quiet", choices=["full", "quiet"],
        help='Execute tests after build, optional argument specifies '
             'the level of output for the testrunner')
    parser.add_argument('--no-init-submodule',
        action='store_true', default=False,
        help='Disable initialization of git submodules')
    parser.add_argument('--no-check-valgrind',
        action='store_true', default=False,
        help='Disable test execution with valgrind after build')
    parser.add_argument('--no-parallel-build',
        action='store_true', default=False,
        help='Disable parallel build')
    parser.add_argument('--no-snapshot',
        action='store_true', default=False,
        help='Disable snapshot generation for IoT.js')
    parser.add_argument('-e', '--experimental',
        action='store_true', default=False,
        help='Enable to build experimental features')
    parser.add_argument('--testsets',
        help='Specify the additional testsets file')

    options = parser.parse_args(argv)
    options.config = build_config

    return options


def adjust_options(options):
    # First fix some option inconsistencies.
    if options.target_os in ['nuttx', 'tizenrt']:
        options.buildlib = True
        if not options.sysroot:
            ex.fail('--sysroot needed for nuttx target')

        options.sysroot = fs.abspath(options.sysroot)
        if not fs.exists(options.sysroot):
            ex.fail('NuttX sysroot %s does not exist' % options.sysroot)

    if options.target_arch == 'x86':
        options.target_arch = 'i686'
    if options.target_arch == 'x64':
        options.target_arch = 'x86_64'

    if options.target_os == 'darwin':
        options.no_check_valgrind = True

    if options.target_board in ['rpi2', 'artik10', 'artik05x']:
        options.no_check_valgrind = True

    if options.napi:
        options.jerryx = True
        if options.testsets is None:
            options.testsets = 'test/napi-testsets.json'

    # Then add calculated options.
    options.host_tuple = '%s-%s' % (platform.arch(), platform.os())
    options.target_tuple = '%s-%s' % (options.target_arch, options.target_os)

    options.build_root = fs.join(path.PROJECT_ROOT,
                                 options.builddir,
                                 options.target_tuple,
                                 options.buildtype)


    cmake_path = fs.join(path.PROJECT_ROOT, 'cmake', 'config', '%s.cmake')
    options.cmake_toolchain_file = cmake_path % options.target_tuple

    # Specify the file of JerryScript profile.
    options.jerry_profile = fs.join(path.JERRY_PROFILE_ROOT,
                                    options.jerry_profile + '.profile')


def print_progress(msg):
    print('==> %s\n' % msg)


def init_submodule():
    ex.check_run_cmd('git', ['submodule', 'init'])
    ex.check_run_cmd('git', ['submodule', 'update'])


def build_cmake_args(options):
    cmake_args = []
    # compile flags
    compile_flags = options.compile_flag
    compile_flags += options.jerry_compile_flag

    cmake_args.append("-DEXTERNAL_COMPILE_FLAGS='%s'" %
        (' '.join(compile_flags)))

    # link flags
    link_flags = options.link_flag

    if options.jerry_lto:
        link_flags.append('-flto')

    cmake_args.append("-DEXTERNAL_LINKER_FLAGS='%s'" % (' '.join(link_flags)))

    # external include dir
    include_dirs = []
    if options.target_os in ['nuttx', 'tizenrt'] and options.sysroot:
        include_dirs.append('%s/include' % options.sysroot)
        if options.target_board == 'stm32f4dis':
            include_dirs.append('%s/arch/arm/src/stm32' % options.sysroot)

    if options.target_os == 'tizenrt':
        include_dirs.append('%s/../framework/include/iotbus' % options.sysroot)

    include_dirs.extend(options.external_include_dir)
    cmake_args.append("-DEXTERNAL_INCLUDE_DIR='%s'" % (' '.join(include_dirs)))

    return cmake_args


def run_make(options, build_home, *args):
    make_opt = ['-C', build_home]
    make_opt.extend(args)
    if not options.no_parallel_build:
        make_opt.append('-j')

    ex.check_run_cmd('make', make_opt)


def get_on_off(boolean_value):
    if boolean_value:
        return 'ON'

    return 'OFF'


def build_iotjs(options):
    print_progress('Build IoT.js')

    # Set IoT.js cmake options.
    cmake_opt = [
        '-B%s' % options.build_root,
        '-H%s' % path.PROJECT_ROOT,
        "-DCMAKE_TOOLCHAIN_FILE='%s'" % options.cmake_toolchain_file,
        '-DCMAKE_BUILD_TYPE=%s' % options.buildtype.capitalize(),
        '-DTARGET_ARCH=%s' % options.target_arch,
        '-DTARGET_OS=%s' % options.target_os,
        '-DTARGET_BOARD=%s' % options.target_board,
        '-DPLATFORM_DESCRIPTOR=%s' % options.target_tuple,
        '-DENABLE_LTO=%s' % get_on_off(options.jerry_lto), # --jerry-lto
        '-DENABLE_SNAPSHOT=%s' % get_on_off(not options.no_snapshot),
        '-DBUILD_LIB_ONLY=%s' % get_on_off(options.buildlib), # --buildlib
        '-DINSTALL_PREFIX=%s' % options.install_prefix,
        # --jerry-memstat
        '-DFEATURE_MEM_STATS=%s' % get_on_off(options.jerry_memstat),
        # --jerry-cpu-profiler
        '-DFEATURE_CPU_PROFILER=%s' % get_on_off(options.jerry_cpu_profiler),
        # --jerry-heap-profiler
        '-DFEATURE_HEAP_PROFILER=%s' % get_on_off(options.jerry_heap_profiler),
        # --jerry-funcname
        '-DFEATURE_FUNCTION_NAME=%s' % get_on_off(options.jerry_function_name),
        # --external-modules
        "-DEXTERNAL_MODULES='%s'" % ';'.join(options.external_modules),
        # --jerry-profile
        "-DFEATURE_PROFILE='%s'" % options.jerry_profile,
    ]

    if options.target_os in ['nuttx', 'tizenrt']:
        cmake_opt.append("-DEXTERNAL_LIBC_INTERFACE='%s'" %
                         fs.join(options.sysroot, 'include'))
        cmake_opt.append("-DTARGET_SYSTEMROOT='%s'" % options.sysroot)
        cmake_opt.append("-DEXTERNAL_CMAKE_SYSTEM_PROCESSOR=arm")

    # --jerry-heaplimit
    if options.jerry_heaplimit:
        cmake_opt.append('-DMEM_HEAP_SIZE_KB=%d' % options.jerry_heaplimit)

    # --jerry-heap-section
    if options.jerry_heap_section:
        cmake_opt.append("-DJERRY_HEAP_SECTION_ATTR='%s'" %
                         options.jerry_heap_section)

    # --jerry-debugger
    if options.jerry_debugger:
        cmake_opt.append('-DFEATURE_DEBUGGER=ON')

    # --napi
    if options.napi:
        cmake_opt.append('-DENABLE_NAPI=ON')

    # --jerryx
    if options.jerryx:
        cmake_opt.append('-DENABLE_JERRYX=ON')

    # --cmake-param
    cmake_opt.extend(options.cmake_param)

    # --external-lib
    cmake_opt.append("-DEXTERNAL_LIBS='%s'" %
                     (' '.join(options.external_lib)))

    # --jerry-cmake-param
    if options.jerry_cmake_param:
        cmake_opt.append("-DEXTRA_JERRY_CMAKE_PARAMS='%s'" %
                         ' '.join(options.jerry_cmake_param))

    # --experimental
    if options.experimental:
        options.compile_flag.append('-DEXPERIMENTAL')

    # --profile
    if options.profile:
        cmake_opt.append("-DIOTJS_PROFILE='%s'" % options.profile)

    # --disable-es2015
    if options.disable_es2015:
        cmake_opt.append("-DISABLE_ES2015")

    # Add common cmake options.
    cmake_opt.extend(build_cmake_args(options))

    # Run cmake.
    ex.check_run_cmd('cmake', cmake_opt)

    if options.install:
        run_make(options, options.build_root, 'install')
    else:
        run_make(options, options.build_root)


def build_napi_test_module(options):
    node_gyp = fs.join(path.PROJECT_ROOT,
                       'node_modules',
                       '.bin',
                       'node-gyp')
    print_progress('Build NAPI test module with %s' % node_gyp)

    project_root = fs.join(path.PROJECT_ROOT, 'test', 'napi')
    ex.check_run_cmd(node_gyp, ['configure'], cwd=project_root)
    ex.check_run_cmd(node_gyp, ['build'], cwd=project_root)


def build_addons_napi_gyp_modules():
    node_gyp = fs.join(path.PROJECT_ROOT,
                       'node_modules',
                       '.bin',
                       'node-gyp')
    print_progress('Build N-API test addons with %s' % node_gyp)
    dirs = glob.glob('test/addons-napi/*')
    dirs = [dir_name for dir_name in dirs if os.path.isdir(dir_name)]
    dirs = [dir_name for dir_name in dirs if os.path.isfile(
        os.path.join(dir_name, 'binding.gyp'))]
    for dir_name in dirs:
        ex.check_run_cmd(node_gyp, ['configure'], cwd=dir_name)
        ex.check_run_cmd(node_gyp, ['build'], cwd=dir_name)


def run_checktest(options):
    checktest_quiet = 'yes'
    if os.getenv('TRAVIS') == "true":
        checktest_quiet = 'no'

    # IoT.js executable
    iotjs = fs.join(options.build_root, 'bin', 'iotjs')
    cmd = fs.join(path.TOOLS_ROOT, 'testrunner.py')
    args = [iotjs]

    # testsets
    if options.testsets:
        args.append('--testsets=' + options.testsets);

    if options.run_test == "quiet":
        args.append('--quiet')

    fs.chdir(path.PROJECT_ROOT)

    # run unit tests
    code = ex.run_cmd(cmd, args)
    if code != 0:
        ex.fail('Failed to pass unit tests')

    if not options.no_check_valgrind:
        code = ex.run_cmd(cmd, ['--valgrind'] + args)
        if code != 0:
            ex.fail('Failed to pass unit tests in valgrind environment')


if __name__ == '__main__':
    # Initialize build option object.
    options = init_options()
    adjust_options(options)

    if options.clean:
        print_progress('Clear build directory')
        fs.rmtree(options.build_root)

    # Perform init-submodule.
    if not options.no_init_submodule:
        print_progress('Initialize submodule')
        init_submodule()

    build_iotjs(options)

    print("\n%sIoT.js Build Succeeded!!%s\n" % (ex._TERM_GREEN, ex._TERM_EMPTY))

    # Run tests.
    if options.run_test:
        print_progress('Build test dependencies')
        build_napi_test_module(options)
        build_addons_napi_gyp_modules()

        print_progress('Run tests')
        if options.buildlib:
            print("Skip unit tests - build target is library\n")
        elif (options.host_tuple == options.target_tuple or
              (options.host_tuple == 'x86_64-linux' and
               options.target_tuple == 'i686-linux')):
             run_checktest(options)
        else:
            print("Skip unit tests - target-host pair is not allowed\n")
    else:
        print("\n%sTo run tests use '--run-test' "
              "or one of the folowing commands:%s"
              % (ex._TERM_BLUE, ex._TERM_EMPTY))
        print("\n    tools/testrunner.py %s/%s/%s/bin/iotjs\n"
              % (options.builddir, options.target_tuple, options.buildtype))
