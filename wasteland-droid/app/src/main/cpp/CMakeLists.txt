cmake_minimum_required(VERSION 3.22.1)
project(wasteland C)

add_library(wasteland SHARED wd_native.c)
target_compile_options(wasteland PRIVATE -O2 -Wall -Wextra -fvisibility=hidden)
target_link_libraries(wasteland log)
