# CMake toolchain file for arm64-ios builds.
#
# Use with: cmake -DCMAKE_TOOLCHAIN_FILE=toolchain/ios.cmake
#
# Drives JSC (M01) and native-dep cross-builds (M02).
#
# Defaults to the iOS device slice. Set IOS_PLATFORM=SIMULATOR for
# aarch64-ios-simulator (Apple Silicon Mac simulator).

cmake_minimum_required(VERSION 3.20)

if(DEFINED CMAKE_TOOLCHAIN_FILE_INCLUDED)
  return()
endif()
set(CMAKE_TOOLCHAIN_FILE_INCLUDED TRUE)

set(IOS_PLATFORM "OS" CACHE STRING "iOS platform (OS|SIMULATOR)")
set(IOS_DEPLOYMENT_TARGET "15.0" CACHE STRING "Minimum iOS version")

set(CMAKE_SYSTEM_NAME iOS)
set(CMAKE_SYSTEM_VERSION ${IOS_DEPLOYMENT_TARGET})

if(IOS_PLATFORM STREQUAL "OS")
  set(IOS_SDK "iphoneos")
  set(CMAKE_OSX_ARCHITECTURES "arm64")
  set(IOS_PLATFORM_FLAG "-miphoneos-version-min=${IOS_DEPLOYMENT_TARGET}")
elseif(IOS_PLATFORM STREQUAL "SIMULATOR")
  set(IOS_SDK "iphonesimulator")
  set(CMAKE_OSX_ARCHITECTURES "arm64")
  set(IOS_PLATFORM_FLAG "-mios-simulator-version-min=${IOS_DEPLOYMENT_TARGET}")
else()
  message(FATAL_ERROR "IOS_PLATFORM must be 'OS' or 'SIMULATOR'")
endif()

execute_process(
  COMMAND xcrun --sdk ${IOS_SDK} --show-sdk-path
  OUTPUT_VARIABLE CMAKE_OSX_SYSROOT
  OUTPUT_STRIP_TRAILING_WHITESPACE)

if(NOT CMAKE_OSX_SYSROOT)
  message(FATAL_ERROR "Could not resolve iOS SDK path for ${IOS_SDK}")
endif()

execute_process(
  COMMAND xcrun --sdk ${IOS_SDK} --find clang
  OUTPUT_VARIABLE CMAKE_C_COMPILER
  OUTPUT_STRIP_TRAILING_WHITESPACE)
execute_process(
  COMMAND xcrun --sdk ${IOS_SDK} --find clang++
  OUTPUT_VARIABLE CMAKE_CXX_COMPILER
  OUTPUT_STRIP_TRAILING_WHITESPACE)
execute_process(
  COMMAND xcrun --sdk ${IOS_SDK} --find ar
  OUTPUT_VARIABLE CMAKE_AR
  OUTPUT_STRIP_TRAILING_WHITESPACE)
execute_process(
  COMMAND xcrun --sdk ${IOS_SDK} --find ranlib
  OUTPUT_VARIABLE CMAKE_RANLIB
  OUTPUT_STRIP_TRAILING_WHITESPACE)

set(CMAKE_C_FLAGS_INIT "${IOS_PLATFORM_FLAG} -isysroot ${CMAKE_OSX_SYSROOT}")
set(CMAKE_CXX_FLAGS_INIT "${IOS_PLATFORM_FLAG} -isysroot ${CMAKE_OSX_SYSROOT} -stdlib=libc++")

# Static linking is the rule for iOS App Store distribution.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

# Find programs from the host (Mac), libs/include from the iOS SDK.
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
set(CMAKE_FIND_ROOT_PATH ${CMAKE_OSX_SYSROOT})

message(STATUS "ios.cmake toolchain: platform=${IOS_PLATFORM} sdk=${IOS_SDK} arch=${CMAKE_OSX_ARCHITECTURES}")
message(STATUS "  sysroot: ${CMAKE_OSX_SYSROOT}")
message(STATUS "  cc:      ${CMAKE_C_COMPILER}")
message(STATUS "  cxx:     ${CMAKE_CXX_COMPILER}")
