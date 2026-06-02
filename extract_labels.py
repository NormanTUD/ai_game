import argparse
import json
import os
import sys
import torch

# Versuchen, ultralytics zu importieren, falls vorhanden (optimal für YOLO11)
try:
    from ultralytics import YOLO

    ULTRALYTICS_AVAILABLE = True
    # Deaktiviert die typischen YOLO-Logs beim reinen Laden
    import logging

    logging.getLogger("ultralytics").setLevel(logging.ERROR)
except ImportError:
    ULTRALYTICS_AVAILABLE = False


def extract_labels(model_path, output_path):
    print(f"Lade Modell: {model_path}...")

    if not os.path.exists(model_path):
        print(f"Fehler: Die Datei '{model_path}' existiert nicht.")
        sys.exit(1)

    labels = None

    # STRATEGIE 1: Direkt über Ultralytics (falls installiert, am sichersten für YOLO11)
    if ULTRALYTICS_AVAILABLE:
        try:
            model = YOLO(model_path)
            if hasattr(model, "names") and model.names:
                labels = model.names
                print("--> Labels erfolgreich via Ultralytics-Bibliothek extrahiert.")
        except Exception:
            # Falls Ultralytics fehlschlägt, nutzen wir den PyTorch Fallback
            pass

    # STRATEGIE 2: Manueller PyTorch-Load mit deaktiviertem weights_only Filter
    if labels is None:
        try:
            # weights_only=False ist nötig ab PyTorch 2.6 für Custom-Klassen wie DetectionModel
            checkpoint = torch.load(
                model_path, map_location="cpu", weights_only=False
            )

            if isinstance(checkpoint, dict):
                possible_keys = ["names", "labels", "classes", "label_names"]
                for key in possible_keys:
                    if key in checkpoint:
                        labels = checkpoint[key]
                        print(f"--> Labels im Key '{key}' gefunden.")
                        break
            else:
                if hasattr(checkpoint, "names"):
                    labels = checkpoint.names
                    print("--> Labels in Objekt-Attribut 'names' gefunden.")
        except Exception as e:
            print(f"Fehler beim Laden der .pt-Datei: {e}")
            sys.exit(1)

    # JSON exportieren
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extrahiert Labels aus einer PyTorch / YOLO11 .pt-Datei."
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
