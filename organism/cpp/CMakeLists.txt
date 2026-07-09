cmake_minimum_required(VERSION 3.10)
project(organism_runtime LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Threads REQUIRED)

add_executable(organism
    src/organism.cpp
    src/main.cpp
)

target_include_directories(organism PRIVATE include)
target_link_libraries(organism PRIVATE Threads::Threads)

# ── organism_native — the callable C ABI shared library ─────────────────
# Builds liborganism_native.{so,dylib,dll} exposing organism_c_api.h.
# Consumed by organism/cpp/bindings/python (ctypes) and any other FFI
# caller — the C++ classes above can't be linked directly from non-C++
# code, this is the stable interface for that.
add_library(organism_native SHARED
    src/organism.cpp
    src/organism_c_api.cpp
)

target_include_directories(organism_native PRIVATE include)
target_link_libraries(organism_native PRIVATE Threads::Threads)
set_target_properties(organism_native PROPERTIES
    POSITION_INDEPENDENT_CODE ON
    PUBLIC_HEADER include/organism_c_api.h
    OUTPUT_NAME "organism_native"
)

# ── Tests ────────────────────────────────────────────────────────────────
enable_testing()

add_executable(test_c_api tests/test_c_api.c)
target_include_directories(test_c_api PRIVATE include)
target_link_libraries(test_c_api PRIVATE organism_native)
target_compile_options(test_c_api PRIVATE -Wall -Wextra -Werror)

add_test(NAME c_api_test COMMAND test_c_api)
set_tests_properties(c_api_test PROPERTIES TIMEOUT 15)
