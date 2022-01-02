#!/user/bin/env bash

git checkout gh-pages
git merge master -m "merge"
./package.sh
git commit -a -m "update gh-pages"
git push
git checkout master

