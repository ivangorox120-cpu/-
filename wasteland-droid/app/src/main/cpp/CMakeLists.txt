cmake_minimum_required(VERSION 3.22.1)
project(wasteland C)

add_library(wasteland SHARED wd_native.c)
target_compile_options(wasteland PRIVATE -O2 -Wall -Wextra -fvisibility=hidden)
target_link_libraries(wasteland log)
# Android 15+: устройства с 16 КБ страницами памяти требуют выравнивания ELF-сегментов
target_link_options(wasteland PRIVATE "-Wl,-z,max-page-size=16384")
