#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

cd $SCRIPT_DIR

bash pt_to_tfjs.sh # installs yolo and dependencies

apt-get install python3-dev python3 git cmake libopenblas-dev libopenblas-base
