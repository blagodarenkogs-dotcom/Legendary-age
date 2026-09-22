# Legendary Age

Разработка:
  npm install
  npm run server        (сервер игры, порт 8080)
  npm start             (лаунчер; адрес сервера в лаунчере: ws://localhost:8080)
  npm run start:local   (лаунчер + сервер в одном процессе)

Сборка портативного .exe (Windows):
  npm run build         ->  dist/Legendary Age 0.2.0.exe

Сервер из .exe:  "Legendary Age 0.2.0.exe" --server        (окно + сервер)
                 "Legendary Age 0.2.0.exe" --server-only   (только сервер)
