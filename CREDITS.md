# Credits

- Nhân vật Mây, Bóng Mực, Gió Lạc, Ông Đăng, bối cảnh Đảo Đèn Lồng: bản gốc của lab.
- Mã nguồn: tự viết cùng Claude Code (Claude Sonnet 5.5) — công cụ AI tạo nội dung duy nhất được dùng.
- Hình ảnh: mọi mô hình 3D dựng từ hình khối cơ bản của three.js ngay trong mã; texture phát sáng vẽ bằng canvas lúc chạy. Không có file ảnh/mô hình ngoài. Ảnh chụp trong `docs/screenshots/` là ảnh chụp game này.
- Âm thanh: nhạc nền và hiệu ứng **tổng hợp bằng WebAudio** trong `src/render/audio.ts` (dao động + nhiễu), không dùng file âm thanh nào.
- Phông chữ: phông hệ thống (Segoe UI / Roboto / sans-serif), không nhúng phông.
- Thư viện: [three.js](https://threejs.org) (MIT), Vite (MIT), TypeScript (Apache-2.0), tsx (MIT), Vitest (MIT), puppeteer-core (Apache-2.0, chỉ dùng cho `bench` và chụp ảnh).
