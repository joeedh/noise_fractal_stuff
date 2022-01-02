#!/usr/bin/env bash

echo Copying Files

mkdir package 2> /dev/null
mkdir package/resources

cp -r assets core editors electron_base path.ux pattern patterns util webgl package
cp screen.js entry_point.js package

rm package/path.ux/.git

#echo "exports.RELEASE = true;" > package/electron_base/config.cjs
./node_modules/.bin/electron-builder --prepackaged ./package --projectDir .
