# Maintainer: Your Name <your.email@example.com>
pkgname=onyx-git
pkgver=r125.6109d31
pkgrel=1
pkgdesc="Open source knowledge base and note-taking app with Nostr integration"
arch=('x86_64')
url="https://github.com/zyrakq/onyx"
license=('MIT')
depends=(
    'webkit2gtk-4.1'
    'libayatana-appindicator'
    'openssl'
    'gtk3'
    'cairo'
    'pango'
    'gdk-pixbuf2'
    'glib2'
    'libsoup3'
    'zstd'
)
makedepends=(
    'git'
    'nodejs'
    'npm'
    'rust'
    'cargo'
    'base-devel'
    'curl'
    'wget'
    'file'
    'clang'
    'nasm'
    'pkgconf'
)
optdepends=(
    'libnotify: desktop notifications'
)
provides=('onyx')
conflicts=('onyx')
source=("$pkgname::git+https://github.com/zyrakq/onyx.git")
sha256sums=('SKIP')

pkgver() {
    cd "$srcdir/$pkgname"
    printf "r%s.%s" "$(git rev-list --count HEAD)" "$(git rev-parse --short HEAD)"
}

prepare() {
    cd "$srcdir/$pkgname"
    
    # Install npm dependencies
    npm install
}

build() {
    cd "$srcdir/$pkgname"
    
    # Build the Tauri application
    npm run tauri build
}

package() {
    cd "$srcdir/$pkgname"
    
    # Install the binary
    install -Dm755 "src-tauri/target/release/onyx" "$pkgdir/usr/bin/onyx"
    
    # Install desktop file
    install -Dm644 "src-tauri/desktop/onyx.desktop" "$pkgdir/usr/share/applications/onyx.desktop"
    
    # Install icons
    for size in 32x32 128x128; do
        install -Dm644 "src-tauri/icons/${size}.png" \
            "$pkgdir/usr/share/icons/hicolor/${size}/apps/onyx.png"
    done
    
    # Install the main icon (fallback)
    install -Dm644 "src-tauri/icons/icon.png" \
        "$pkgdir/usr/share/pixmaps/onyx.png"
    
    # Install license
    install -Dm644 "LICENSE" "$pkgdir/usr/share/licenses/$pkgname/LICENSE" 2>/dev/null || true
    
    # Install README
    install -Dm644 "README.md" "$pkgdir/usr/share/doc/$pkgname/README.md"
}
