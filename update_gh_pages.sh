#!/usr/bin/env bash

git commit -a
git push

git checkout gh-pages || exit 1

git merge master -m "merge"
./package.sh
git commit -a -m "update gh-pages"
git push
git checkout master --force

