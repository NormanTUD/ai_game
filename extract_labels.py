import argparse
import json
import os
import sys
import torch


def extract_labels(model_path, output_path):
    print(f"Lade Modell: {model_path}...")

    if not os.path.exists(model_path):
        print(f"Fehler: Die Datei '{model_path}' existiert nicht.")
        sys.exit(1)

    try:
        # Modell laden (auf CPU, um keine GPU zu erzwingen)
        checkpoint = torch.load(model_path, map_location="cpu")
    except Exception as e:
        print(f"Fehler beim Laden der .pt-Datei: {e}")
        sys.exit(1)

    labels = None

    # Strategie 1: Dictionary-Struktur prüfen
    if isinstance(checkpoint, dict):
        possible_keys = [
            "labels",
            "classes",
            "label_names",
            "names",
            "config",
            "hyper_parameters",
        ]
        for key in possible_keys:
            if key in checkpoint:
                # Falls 'config' ein verschachteltes Dict/Objekt ist
                if key == "config" and hasattr(checkpoint[key], "id2label"):
                    labels = checkpoint[key].id2label
                else:
                    labels = checkpoint[key]
                print(f"--> Labels im Key '{key}' gefunden.")
                break

    # Strategie 2: Direktes Modell-Objekt (z.B. Hugging Face / YOLOv8)
    else:
        if hasattr(checkpoint, "names"):  # YOLO-Standard
            labels = checkpoint.names
            print("--> Labels in 'model.names' (YOLO) gefunden.")
        elif hasattr(checkpoint, "config") and hasattr(
            checkpoint.config, "id2label"
        ):
            labels = checkpoint.config.id2label
            print("--> Labels in 'model.config.id2label' gefunden.")

    # Ergebnis speichern
    if labels is not None:
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(labels, f, indent=4, ensure_ascii=False)
            print(f"Erfolg: Labels erfolgreich in '{output_path}' gespeichert!")
        except Exception as e:
            print(f"Fehler beim Schreiben der JSON-Datei: {e}")
    else:
        print(
            "Fehler: Es wurden keine Labels in den Metadaten der .pt-Datei gefunden."
        )
        print(
            "Hinweis: Wenn das Modell nur reine Gewichte (state_dict) enthält, sind keine Labelnamen integriert."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extrahiert Labels aus einer PyTorch .pt-Datei und speichert sie als JSON."
    )
    parser.add_argument(
        "-m",
        "--model",
        type=str,
        required=True,
        help="Pfad zur model.pt Datei",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default="label.json",
        help="Pfad zur Ausgabe-JSON (Standard: label.json)",
    )

    args = parser.parse_args()
    extract_labels(args.model, args.output)
