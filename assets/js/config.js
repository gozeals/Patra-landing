/**
 * ============================================================================
 *  KONFIGURASI PATRA — satu-satunya file yang perlu Anda ubah setelah deploy
 * ============================================================================
 *  1. GAS_URL  : tempel URL Web App Apps Script (diakhiri /exec).
 *                Kosongkan ('') untuk MODE DEMO (data contoh di browser, tanpa server).
 *  2. FALLBACK : konten cadangan. Dipakai saat server lambat/gagal, sehingga
 *                halaman & tombol "Pesan" tetap berfungsi. Samakan dengan isi
 *                sheet "Pengaturan" setelah Anda mengubahnya.
 * ============================================================================
 */
window.PATRA_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxRjZDmTmJj9t_QHT_RJPFNil52VJ-06D7sA_0Ay_FEYXldSG-7yy0_ASfOE4OnZOm2-A/exec',

  FALLBACK: {
    settings: {
      LINK_LYNK: 'https://lynk.id/patra',
      NO_WA_ADMIN: '6281234567890',
      PESAN_WA_DEFAULT: 'Halo PATRA, saya ingin bertanya tentang kartu NFC Google Review.',
      EMAIL_KONTAK: 'halo@patra.id',
      JAM_LAYANAN: 'Senin – Sabtu, 09.00 – 17.00 WIB',
      HERO_JUDUL: 'Satu Tap, Ulasan Google Mengalir.',
      HERO_SUBJUDUL: 'Pelanggan cukup menempelkan ponsel ke kartu PATRA atau memindai QR-nya, halaman ulasan Google bisnis Anda langsung terbuka. Tanpa aplikasi, tanpa ribet.',
      SEO_TITLE: 'PATRA — Kartu NFC untuk Ulasan Google Bisnis Anda',
      SEO_DESC: 'Tingkatkan ulasan Google bisnis Anda dengan kartu NFC & QR PATRA. Satu tap, pelanggan langsung menulis ulasan.',
      INSTAGRAM: 'https://instagram.com/patra.id',
      TIKTOK: 'https://tiktok.com/@patra.id'
    },
    faq: [
      { q: 'Apakah pelanggan perlu memasang aplikasi?', a: 'Tidak perlu. Ponsel dengan NFC cukup ditempelkan ke kartu, halaman ulasan Google langsung terbuka di browser.' },
      { q: 'Bagaimana jika ponsel pelanggan tidak punya NFC?', a: 'Setiap kartu PATRA dilengkapi kode QR. Pelanggan cukup memindainya dengan kamera ponsel.' },
      { q: 'Apakah kartu PATRA butuh baterai atau pengisian daya?', a: 'Tidak. Chip NFC bekerja tanpa baterai karena mendapat daya dari ponsel saat ditempelkan.' },
      { q: 'Apakah tautan ulasan bisa diubah setelah kartu dibuat?', a: 'Bisa. Hubungi tim kami dan tautan akan diperbarui tanpa perlu mengganti kartu.' },
      { q: 'Berapa lama proses pembuatan dan pengiriman?', a: 'Umumnya 2–4 hari kerja untuk produksi, ditambah waktu pengiriman sesuai lokasi Anda.' },
      { q: 'Bagaimana cara memesan?', a: 'Klik tombol "Pesan Sekarang". Anda akan diarahkan ke halaman Lynk.id PATRA untuk memilih produk dan membayar dengan aman.' }
    ],
    testimoni: [
      { nama: 'Dimas Pratama', bisnis: 'Kopi Senja Kemang', jenis: 'Kafe', isi: 'Dalam sebulan ulasan Google kami naik hampir tiga kali lipat. Pelanggan senang karena cukup tap, tidak perlu cari-cari nama kafe di Maps.', rating: 5, foto: '' },
      { nama: 'dr. Nadia Soraya', bisnis: 'Glow Aesthetic Clinic', jenis: 'Klinik', isi: 'Kartunya elegan dan cocok di meja resepsionis. Pasien jadi lebih mudah memberi ulasan setelah perawatan.', rating: 5, foto: '' },
      { nama: 'Wayan Ardika', bisnis: 'Ubud Serene Villas', jenis: 'Hotel', isi: 'Tamu kami dari berbagai negara langsung paham cara pakainya. Rating di Google ikut naik, sangat membantu reservasi.', rating: 5, foto: '' }
    ]
  }
};
