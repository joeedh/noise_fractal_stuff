#!/usr/bin/env bash

echo Copying Files

mkdir package 2> /dev/null
mkdir package/resources

cp -r assets core editors electron_base path.ux pattern patterns util webgl package
cp main.html screen.js entry_point.js $PACKAGE_DIR

rm $PACKAGE_DIR/path.ux/.git
