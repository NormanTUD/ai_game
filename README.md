# annotate 🖼️: AI-Assisted, No-Code Image Annotation

![Screenshot](screens/screen1.png "No AI")

annotate is a highly efficient, web-based tool for generating bounding box labels for computer vision tasks. It is designed to accelerate large-scale data preparation by integrating trained AI models directly into the labeling workflow.

## ✨ Key Features

- Annotation Type: Supports basic Bounding Boxes for object detection.
- No-Code Interface: Manage and label data without writing any code.
- Universal YOLO Export: Datasets are exported in the standard YOLO format, compatible with all YOLO versions (including YOLOv8, v9, and v11).
- Immediate Model Assistance: Upload pre-trained models (like YOLOv11n/x) before manual labeling begins to instantly start assisting annotation.
- PyTorch Auto-Convert: Directly upload PyTorch YOLO models; they are automatically converted to TensorFlow.js (TFJS) for in-browser, model-assisted labeling (providing both boxes and classification).
- Collaborative Curation: Includes a foundational Curation System for volunteer groups to review and quality-check annotations.
- Local Processing: Runs securely via Docker, keeping all data preparation on your local machine.

## 💡 The Annotation Workflow

annotate streamlines the data loop:

1. Start Smart: Import a pre-trained model (PyTorch YOLO accepted) to begin assisted labeling immediately.
2. Label & Refine: Annotate data using the UI. The model suggests accurate bounding boxes and classifications, turning manual work into quick verification.
3. Export & Train: Export the dataset. The local training script sets up a venv, handles image downloads, and generates YOLO-formatted .txt label files for training the next iteration of your AI.

## 🛠️ Getting Started

1. annotate is launched with a single script. It handles the installation of Docker and required environments if they are not found.

Installation and Run

Clone the Repository:

```bash
git clone --depth 1 https://github.com/NormanTUD/annotate.git
cd annotate
```


2. Run the Setup Script:
The script builds the image and launches the container.

```bash
bash docker.sh --local-port 3431
```


annotate should now be accessible in your browser at: http://localhost:3431

## Allow local training

Run `touch allow_local_training` inside this folder to allow local training.

## 🤝 Contribution

We rely on voluntary contributions to enhance and expand features like the curation system. If you are a developer, please check out the issues section or open a pull request!
