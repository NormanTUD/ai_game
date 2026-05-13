#!/bin/bash
set -euo pipefail

export DOCKER_BUILDKIT=1

if ! command -v ip 2>/dev/null >/dev/null; then
	echo "ip not found. Try installing iproute2"
	exit 6
fi

# Grundlegende Tools prüfen
for cmd in apt dpkg-query sudo; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "$cmd not found. Only for Debian-like systems."
        exit 5
    fi
done

if ! command -v docker &>/dev/null; then
    echo "docker not found. Installing docker..."
    sudo apt update
    sudo apt install -y --no-install-recommends docker.io
fi

# Whiptail & git installieren falls nötig
for cmd in whiptail git; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "$cmd not found. Installing $cmd..."
        sudo apt install -y "$cmd"
    fi
done

DB_HOST=""
INSTANCE_NAME=annotate
DB_USER=root
DB_PASSWORD=""
LOCAL_PORT=""
custom_local_db_dir=0
NO_CACHE=0

help_message() {
    echo "Usage: bash docker.sh [OPTIONS]"
    echo "  --local-db-dir     Path to local db dir"
    echo "  --local-port       Local port for GUI"
    echo "  --instance-name    Name of the instance"
    echo "  --no-cache         Disables docker-cache"
    echo "  --help             Show this help message"
}

# CLI parsing
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --instance-name*) INSTANCE_NAME="$2"; shift ;;
        --local-db-dir*) local_db_dir="$(realpath "$2")"; custom_local_db_dir=1; shift ;;
        --local-port*) LOCAL_PORT="$2"; shift ;;
        --no-cache) NO_CACHE=1 ;;
        --help) help_message; exit 0 ;;
        *) echo "Unknown option '$1'"; help_message; exit 1 ;;
    esac
    shift
done

if [[ $custom_local_db_dir -eq 0 ]]; then local_db_dir="$HOME/${INSTANCE_NAME}_db"; fi
if [[ -z $LOCAL_PORT ]]; then echo "Missing --local-port"; exit 2; fi

# IP-Auswahl für localhost
ips=$(ip addr | grep inet | grep -v : | sed -e 's#.*inet\s*##' -e 's#/.*##' | grep -v "^127.")
if [[ $DB_HOST == "localhost" || $DB_HOST == "127.0.0.1" ]]; then
    ip_array=(); while read -r ip; do ip_array+=("$ip" ""); done <<< "$ips"
    selected_ip=$(whiptail --title "Local IPs" --menu "Choose a local IP:" 15 60 6 "${ip_array[@]}" 3>&1 1>&2 2>&3)
    [[ -z $selected_ip ]] && echo "No IP selected" && exit 3
    DB_HOST="$selected_ip"
fi
export DB_HOST
export LOCAL_PORT

# .env erstellen
cat > .env <<EOL
DB_HOST=${INSTANCE_NAME}_mariadb
DB_PORT=3306
LOCAL_PORT=$LOCAL_PORT
DB_PASSWORD=root
DB_USER=root
EOL

mkdir -p "$local_db_dir"

# docker-compose.yml
cat > docker-compose.yml <<EOL
services:
  ${INSTANCE_NAME}_mariadb:
    image: mariadb:latest
    container_name: ${INSTANCE_NAME}_mariadb
    restart: always
    environment:
      - MYSQL_ROOT_PASSWORD=root
      - MYSQL_ROOT_HOST=%
    volumes:
      - $local_db_dir:/var/lib/mysql
      - ./my.cnf:/etc/mysql/conf.d/disable_locks.cnf:ro
    networks:
      - ${INSTANCE_NAME}_network

  ${INSTANCE_NAME}_annotate:
    build:
      context: .
      args:
        - INSTANCE_NAME=${INSTANCE_NAME}
    container_name: ${INSTANCE_NAME}_annotate
    restart: unless-stopped
    depends_on:
      - ${INSTANCE_NAME}_mariadb
    environment:
      - DB_HOST=${INSTANCE_NAME}_mariadb
      - DB_PORT=3306
      - DB_USER=root
      - DB_PASSWORD=root
    networks:
      - ${INSTANCE_NAME}_network
    ports:
      - $LOCAL_PORT:8080
    tmpfs:
      - /tmp:rw
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /usr/bin/docker:/usr/bin/docker
      - .:/var/www/html

volumes:
  mariadb_data:

networks:
  ${INSTANCE_NAME}_network:
    driver: bridge
EOL

if ! docker compose &>/dev/null; then
    sudo apt-get install -y docker-compose-plugin
fi

CMD="docker compose"
if [[ "$(id -u)" -ne 0 ]] && ! groups "$USER" | grep -qw docker; then
	CMD="sudo docker compose"
fi

# 🔧 Fix: www-data Zugriff auf Docker-Socket
if [[ -S /var/run/docker.sock ]]; then
	SOCKET_GID=$(stat -c '%g' /var/run/docker.sock)
	EXISTING_GROUP=$(getent group "$SOCKET_GID" | cut -d: -f1 || true)
	if [[ -z "$EXISTING_GROUP" ]]; then
		sudo groupadd -g "$SOCKET_GID" docker_host || true
		EXISTING_GROUP=docker_host
	fi

	if ! id -nG www-data | grep -qw "$EXISTING_GROUP"; then
		if [[ $EUID -ne 0 ]]; then
			sudo usermod -aG "$EXISTING_GROUP" www-data || true
		else
			usermod -aG "$EXISTING_GROUP" www-data || true
		fi
	fi
fi

$CMD -p "${INSTANCE_NAME}" down --remove-orphans

BUILD_ARGS=""
if [[ $NO_CACHE -eq 1 ]]; then
    BUILD_ARGS="--no-cache"
fi

$CMD -p "${INSTANCE_NAME}" build $BUILD_ARGS

$CMD -p "${INSTANCE_NAME}" up -d
