# Деплой BeerPub на сервер

Автоматический деплой выполняется через GitHub Actions (`.github/workflows/deploy.yml`)  
при пуше в ветку `main` или вручную через **Actions → Deploy BeerPub → Run workflow**.

Раннер: `ubuntu-latest`. Подключение к серверу — по SSH (`appleboy/ssh-action`).

## Требования на сервере

- Ubuntu 22.04, пользователь `server`
- Docker 29+ с `docker compose`
- PostgreSQL на хосте (не в Docker)
- Traefik с директорией `/data/traefik/dynamic`
- Клон репозитория: `/data/projects/bar_fastapi`
- Файл `.env` с продакшен-настройками (не в git)
- Systemd unit: `beerpub-backend.service` (см. ниже)

### Первичная настройка сервера

```bash
# Клонировать репозиторий
sudo mkdir -p /data/projects
sudo chown server:server /data/projects
cd /data/projects
git clone <URL_репозитория> bar_fastapi
cd bar_fastapi

# Создать .env из примера и заполнить продакшен-значения
cp .env.example .env
nano .env

# Установить systemd-сервис
sudo cp deploy/beerpub-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable beerpub-backend

# Скопировать конфиг Traefik
sudo cp deploy/beerpub.yml /data/traefik/dynamic/

# Первый запуск
docker compose -f docker-compose.yml up -d --build
sudo systemctl start beerpub-backend
```

### Sudo без пароля (для деплоя)

Пользователь `server` должен иметь право выполнять команды для Traefik и systemd без пароля:

```bash
sudo visudo -f /etc/sudoers.d/beerpub-deploy
```

```
server ALL=(ALL) NOPASSWD: /bin/cp /data/projects/bar_fastapi/deploy/beerpub.yml /data/traefik/dynamic/*
server ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
server ALL=(ALL) NOPASSWD: /bin/systemctl restart beerpub-backend
server ALL=(ALL) NOPASSWD: /bin/systemctl status beerpub-backend *
```

## Секреты GitHub

Добавьте в **Settings → Secrets and variables → Actions → New repository secret**:

| Секрет           | Значение              | Описание                          |
|------------------|-----------------------|-----------------------------------|
| `SERVER_HOST`    | `194.150.254.99`      | IP или домен сервера              |
| `SERVER_USER`    | `server`              | SSH-пользователь                  |
| `SERVER_SSH_KEY` | приватный ключ        | Приватный SSH-ключ для деплоя     |

### Как получить SSH-ключ

**На своей машине** (если ключа ещё нет):

```bash
ssh-keygen -t ed25519 -C "github-actions-beerpub" -f ~/.ssh/beerpub_deploy -N ""
```

**Добавить публичный ключ на сервер:**

```bash
ssh-copy-id -i ~/.ssh/beerpub_deploy.pub server@194.150.254.99
```

Или вручную на сервере:

```bash
# На сервере под пользователем server
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "содержимое beerpub_deploy.pub" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**Добавить приватный ключ в GitHub:**

```bash
cat ~/.ssh/beerpub_deploy
```

Скопируйте весь вывод (включая `-----BEGIN ... KEY-----` и `-----END ... KEY-----`)  
в секрет `SERVER_SSH_KEY`.

### Git pull на сервере

Для `git pull` в workflow репозиторий на сервере должен иметь доступ к GitHub:

```bash
# На сервере — deploy key или SSH URL
cd /data/projects/bar_fastapi
git remote -v
# Должен быть git@github.com:USER/bar_fastapi.git
```

При необходимости добавьте deploy key в **GitHub → Settings → Deploy keys**.

## Проверка деплоя

1. Запушьте в `main` или запустите workflow вручную.
2. Откройте **Actions** в репозитории — job **Deploy BeerPub** должен завершиться зелёным.
3. На сервере:

```bash
cd /data/projects/bar_fastapi
docker compose -f docker-compose.yml ps
curl -s http://localhost:8000/api/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
sudo systemctl status beerpub-backend
```

4. Снаружи:
   - https://bar.adgsklad.ru — фронтенд
   - https://bar.adgsklad.ru/api/health — API

## Локальная vs продакшен конфигурация

| Параметр        | Локально (`docker compose up`)     | Продакшен (сервер)                    |
|-----------------|-------------------------------------|---------------------------------------|
| Compose-файлы   | `docker-compose.yml` + `override`   | только `docker-compose.yml`           |
| PostgreSQL      | контейнер `db`                      | хост `172.17.0.1:5432`                |
| Фронтенд        | http://localhost:3000               | https://bar.adgsklad.ru               |
| API             | http://localhost:8000               | https://bar.adgsklad.ru/api           |

См. также `.env.example` для примеров переменных окружения.
