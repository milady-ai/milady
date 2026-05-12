# Convenience wrapper for the aarch64-ios-simulator slice.
# Equivalent to: -DCMAKE_TOOLCHAIN_FILE=toolchain/ios.cmake -DIOS_PLATFORM=SIMULATOR

set(IOS_PLATFORM "SIMULATOR" CACHE STRING "")
include(${CMAKE_CURRENT_LIST_DIR}/ios.cmake)
