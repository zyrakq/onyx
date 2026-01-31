# PKGBUILD для Arch Linux - Onyx

## Установка

### Из локального репозитория

1. Склонируйте репозиторий или скачайте файлы `PKGBUILD` и `.SRCINFO`
2. Перейдите в директорию с PKGBUILD:

   ```bash
   cd /path/to/onyx
   ```

3. Соберите и установите пакет:

   ```bash
   makepkg -si
   ```

### Из AUR (после публикации)

```bash
yay -S onyx-git
# или
paru -S onyx-git
```

## Зависимости

### Зависимости для сборки

- git
- nodejs
- npm
- rust
- cargo
- base-devel
- clang (необходим для компиляции нативного кода крипто-библиотек)
- nasm (ассемблер для оптимизированного кода криптографии)
- pkgconf (для поиска системных библиотек)
- curl
- wget
- file

### Рантайм зависимости

- webkit2gtk-4.1
- libayatana-appindicator
- openssl
- gtk3
- cairo
- pango
- gdk-pixbuf2
- glib2
- libsoup3
- zstd (библиотека сжатия)

### Опциональные зависимости

- libnotify: для системных уведомлений

## Исправления для Wayland

### Проблема

При запуске AppImage на Wayland возникала ошибка:

```
Could not create surfaceless EGL display: EGL_BAD_ALLOC. Aborting...
```

### Решение

**1. Изменение в `src-tauri/tauri.conf.json`:**

Изменили `bundleMediaFramework` с `false` на `true`:

```json
"appimage": {
  "bundleMediaFramework": true
}
```

Это включает необходимые медиа-библиотеки WebKit в AppImage, что решает проблему с инициализацией EGL на Wayland.

**2. Правильные зависимости в PKGBUILD:**

Убедились, что установлены все необходимые библиотеки:

- `webkit2gtk-4.1` - движок рендеринга с поддержкой Wayland
- `libsoup3` - HTTP библиотека для WebKit
- Mesa драйверы (обычно уже установлены)

### Дополнительные рекомендации для Wayland

Если приложение всё ещё не запускается на Wayland, попробуйте:

1. **Установить переменные окружения:**

   ```bash
   export WEBKIT_DISABLE_COMPOSITING_MODE=1
   export GDK_BACKEND=wayland
   onyx
   ```

2. **Принудительный XWayland (fallback):**

   ```bash
   GDK_BACKEND=x11 onyx
   ```

3. **Проверить наличие Mesa с EGL:**

   ```bash
   pacman -Qs mesa
   ```

## Публикация в AUR

Для публикации пакета в AUR:

1. Создайте пустой git-репозиторий на AUR:

   ```bash
   git clone ssh://aur@aur.archlinux.org/onyx-git.git aur-onyx-git
   cd aur-onyx-git
   ```

2. Скопируйте PKGBUILD и .SRCINFO:

   ```bash
   cp /path/to/onyx/PKGBUILD .
   cp /path/to/onyx/.SRCINFO .
   ```

3. Закоммитьте и отправьте:

   ```bash
   git add PKGBUILD .SRCINFO
   git commit -m "Initial commit"
   git push
   ```

## Тестирование

После установки проверьте:

1. **Запуск приложения:**

   ```bash
   onyx
   ```

2. **Проверка .desktop файла:**

   ```bash
   cat /usr/share/applications/onyx.desktop
   ```

3. **Проверка иконок:**

   ```bash
   ls /usr/share/icons/hicolor/*/apps/onyx.png
   ```

## Обновление пакета

Для обновления до последней версии из git:

```bash
cd /path/to/your/build/directory
makepkg -sif
```

Или через AUR helper:

```bash
yay -Syu onyx-git
```

## Структура пакета

После установки файлы будут размещены:

- Бинарник: `/usr/bin/onyx`
- Desktop файл: `/usr/share/applications/onyx.desktop`
- Иконки:
  - `/usr/share/icons/hicolor/32x32/apps/onyx.png`
  - `/usr/share/icons/hicolor/128x128/apps/onyx.png`
  - `/usr/share/pixmaps/onyx.png`
- Документация: `/usr/share/doc/onyx-git/README.md`
- Лицензия: `/usr/share/licenses/onyx-git/LICENSE`

## Удаление

```bash
sudo pacman -R onyx-git
```

## Проблемы и отладка

### Приложение не запускается

1. Проверьте зависимости:

   ```bash
   ldd /usr/bin/onyx
   ```

2. Запустите с отладкой:

   ```bash
   RUST_LOG=debug onyx
   ```

### Проблемы с иконками

Обновите кеш иконок:

```bash
gtk-update-icon-cache -f -t /usr/share/icons/hicolor
```

### Проблемы с глубокими ссылками

Убедитесь, что xdg-utils установлен:

```bash
sudo pacman -S xdg-utils
```

## Контрибьюция

Если вы хотите внести изменения в PKGBUILD, пожалуйста:

1. Форкните репозиторий
2. Создайте ветку для изменений
3. Протестируйте сборку
4. Создайте Pull Request

## Лицензия

Onyx распространяется под лицензией MIT.
