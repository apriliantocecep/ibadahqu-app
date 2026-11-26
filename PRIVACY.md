# Kebijakan Privasi — Jadwal Ibadah (IbadahQu)

**Berlaku sejak:** 26 November 2026

Kebijakan ini berlaku untuk extension Chrome **Jadwal Ibadah** dan web app **IbadahQu** (selanjutnya "aplikasi").

*English version below.*

## Ringkasan

- Aplikasi **tidak mengumpulkan, tidak menjual, dan tidak membagikan** data pribadi Anda.
- Semua pengaturan disimpan **hanya di perangkat Anda**.
- Aplikasi tidak memakai analitik, iklan, cookie pelacak, atau akun/login.
- Satu-satunya koneksi keluar adalah ke [API myQuran](https://api.myquran.com) untuk mengambil jadwal salat, dan yang dikirim hanya **ID kota, tahun, dan bulan**.

## Data yang disimpan di perangkat

Data berikut disimpan di `chrome.storage.local` (extension) atau `localStorage` (web app). Data ini tidak pernah keluar dari perangkat Anda dan tidak bisa kami akses.

| Data | Kegunaan |
| --- | --- |
| Lokasi yang dipilih (nama kota, atau koordinat bila memakai GPS) | Menghitung dan menampilkan jadwal salat untuk lokasi Anda |
| Koreksi waktu (± menit per waktu salat) | Menyesuaikan jadwal dengan masjid setempat |
| Pengaturan notifikasi dan pengingat | Menentukan kapan notifikasi ditampilkan |
| Cache jadwal salat per bulan | Agar aplikasi tetap berfungsi saat offline |

## Lokasi (GPS)

- Lokasi **hanya** dibaca saat Anda menekan tombol **"Gunakan lokasi saya"**. Aplikasi tidak melacak lokasi di latar belakang.
- Koordinat disimpan di perangkat dan dipakai untuk mencari kota terdekat atau untuk menghitung jadwal secara lokal.
- **Koordinat tidak pernah dikirim ke server mana pun**. Bila tersedia, yang dikirim ke API myQuran hanya ID kota terdekat.

## Koneksi ke layanan pihak ketiga

Aplikasi mengambil jadwal salat dari **API myQuran** (`https://api.myquran.com`), yang menyediakan data Bimas Islam Kemenag RI. Contoh permintaan:

```
GET https://api.myquran.com/v2/sholat/jadwal/1301/2026/11
```

Permintaan ini hanya berisi ID kota, tahun, dan bulan. Seperti permintaan internet pada umumnya, server myQuran dapat melihat alamat IP dan informasi teknis browser Anda. Penanganan data tersebut tunduk pada kebijakan pengelola myQuran. Bila API tidak dapat diakses, aplikasi menghitung jadwal secara lokal tanpa koneksi apa pun.

## Izin extension

| Izin | Alasan |
| --- | --- |
| `storage` | Menyimpan pengaturan dan cache jadwal di perangkat |
| `alarms` | Memperbarui badge countdown tiap menit dan memicu notifikasi tepat waktu |
| `notifications` | Menampilkan pemberitahuan masuk waktu salat dan pengingat |
| `geolocation` | Membaca lokasi hanya saat Anda menekan "Gunakan lokasi saya" |
| `https://api.myquran.com/*` | Mengambil jadwal salat resmi Kemenag RI |

## Menghapus data

- **Extension:** hapus extension di `chrome://extensions`; semua data di `chrome.storage.local` ikut terhapus.
- **Web app:** hapus data situs melalui pengaturan browser (*Settings → Privacy → Site data*).

## Anak-anak

Aplikasi tidak mengumpulkan data dari siapa pun, termasuk anak-anak.

## Perubahan kebijakan

Bila kebijakan ini berubah, versi terbaru akan dipublikasikan di halaman ini dengan tanggal berlaku yang diperbarui.

## Kontak

Pertanyaan tentang kebijakan ini dapat diajukan melalui [GitHub Issues](https://github.com/apriliantocecep/ibadahqu-app/issues).

---

# Privacy Policy — Jadwal Ibadah (IbadahQu)

**Effective date:** November 26, 2026

This policy applies to the **Jadwal Ibadah** Chrome extension and the **IbadahQu** web app ("the app").

## Summary

- The app **does not collect, sell, or share** any personal data.
- All settings are stored **only on your device**.
- No analytics, advertising, tracking cookies, or user accounts.
- The only outgoing connection is to the [myQuran API](https://api.myquran.com) to fetch prayer times, and the request contains only a **city ID, year, and month**.

## Data stored on your device

The following data is stored in `chrome.storage.local` (extension) or `localStorage` (web app). It never leaves your device and is not accessible to us.

| Data | Purpose |
| --- | --- |
| Selected location (city name, or coordinates if GPS is used) | Calculating and displaying prayer times for your location |
| Time corrections (± minutes per prayer) | Matching your local mosque's schedule |
| Notification and reminder settings | Deciding when notifications are shown |
| Monthly prayer-time cache | Keeping the app working offline |

## Location (GPS)

- Your location is read **only** when you press **"Gunakan lokasi saya"** (Use my location). The app does not track your location in the background.
- Coordinates are stored on your device and used to find the nearest city or to calculate prayer times locally.
- **Coordinates are never sent to any server**. When available, only the nearest city's ID is sent to the myQuran API.

## Third-party services

Prayer times are fetched from the **myQuran API** (`https://api.myquran.com`), which provides data from the Indonesian Ministry of Religious Affairs (Kemenag RI). Requests contain only a city ID, year, and month. As with any internet request, the myQuran server can see your IP address and basic browser information, which is subject to the myQuran operator's policies. If the API is unavailable, prayer times are calculated locally without any network connection.

## Extension permissions

| Permission | Reason |
| --- | --- |
| `storage` | Store settings and the prayer-time cache on the device |
| `alarms` | Update the countdown badge every minute and trigger notifications on time |
| `notifications` | Show prayer-time and reminder notifications |
| `geolocation` | Read location only when you press "Use my location" |
| `https://api.myquran.com/*` | Fetch official Kemenag RI prayer times |

## Deleting your data

- **Extension:** remove the extension at `chrome://extensions`; all data in `chrome.storage.local` is deleted with it.
- **Web app:** clear the site data in your browser settings.

## Children

The app does not collect data from anyone, including children.

## Changes

Any changes to this policy will be published on this page with an updated effective date.

## Contact

Questions about this policy can be submitted via [GitHub Issues](https://github.com/apriliantocecep/ibadahqu-app/issues).
