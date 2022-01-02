#!/usr/bin/env bash

echo Copying Files

mkdir package/resources

export PACKAGE_DIR=package
source ./copy_package_files.sh

rm package/path.ux/.git

#echo "exports.RELEASE = true;" > package/electron_base/config.cjs
./node_modules/.bin/electron-builder --prepackaged ./package --projectDir .
