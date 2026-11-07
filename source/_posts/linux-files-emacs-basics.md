---
title: Linux 入门：创建文件、保存代码和 Emacs 复制
lang: zh-CN
translation_key: linux-files-emacs-basics
permalink: posts/linux-files-emacs-basics/
date: '2026-11-07T14:07:00+09:00'
updated: '2026-11-07T14:07:00+09:00'
published: true
tags:
  - Linux
  - 学习笔记
categories:
  - 边学边记
cover: https://i0.wp.com/w.wallhaven.cc/full/yq/wallhaven-yqgge7.png?w=1600&quality=80&strip=all
description: 把近期使用 Linux 与 Emacs 时遇到的文件、复制和只读问题整理成可重复操作的步骤。
---

开始用 Linux 写 C 语言时，困难有时候不在语法，而在“文件到底存在哪里”“怎么保存”“为什么编辑器说只读”。把这些步骤单独记下来，写程序时就不用反复卡在同一个地方。

<!-- more -->

## 先知道自己在哪里

```sh
pwd
ls
mkdir c-practice
cd c-practice
touch hello.c
emacs hello.c
```

pwd 显示当前目录，ls 列出内容，mkdir 创建目录，cd 切换目录。touch 在文件不存在时创建空文件，文件已存在时通常更新它的时间戳，不会清空原内容。

这些是 Linux 终端里的例子。文件名区分大小写，hello.c 和 Hello.c 可以是两个不同文件。

## Emacs 的按键怎么读

C 表示 Ctrl，M 表示 Meta。常见键盘上可以用 Alt；也可以先按 Esc，松开后再按后面的键。

| 操作 | 按键 | 说明 |
| --- | --- | --- |
| 保存 | C-x C-s | 先按 Ctrl+x，再按 Ctrl+s |
| 退出 | C-x C-c | 有未保存修改时会询问 |
| 设置选区起点 | C-SPC | Ctrl+空格，再移动光标 |
| 复制选区 | M-w | 保存到 kill ring |
| 剪切选区 | C-w | 删除并保存到 kill ring |
| 粘贴 | C-y | 插入 kill ring 中的内容 |
| 取消当前操作 | C-g | 卡在提示或命令里时很有用 |

如果 Ctrl+空格被输入法占用，可尝试 C-@ 设置标记。终端环境里，系统剪贴板和 Emacs 的 kill ring 也不一定互通；复制成功却无法粘到其他应用时，需要区分这两套机制。

## 只读有两种不同情况

一种是 Emacs 的缓冲区处于只读状态，可以用 C-x C-q 切换。另一种是文件或所在目录的系统权限不允许写入。前者允许编辑，不代表后者允许保存。

先用 ls -l hello.c 查看所有者和权限。如果是自己拥有、也确实应该可写的练习文件，可以用 chmod u+w hello.c 给所有者增加写权限。若文件属于系统或其他用户，先确认用途，通常把需要练习的内容复制到自己的目录更合适，不要一上来修改成所有人都可写。

## 保存以后再编译

```sh
gcc -std=c17 -Wall -Wextra hello.c -o hello
./hello
```

前提是系统已安装 GCC，而且当前目录中有保存好的 C 源文件。-o 指定输出程序名；./hello 表示运行当前目录的 hello。

改完源代码后，需要保存并重新编译，运行的程序才会更新。以后遇到“明明改了怎么结果没变”，先检查这两步。

相关笔记：[C 语言 Hello World](/posts/c-hello-world-editors/)。
