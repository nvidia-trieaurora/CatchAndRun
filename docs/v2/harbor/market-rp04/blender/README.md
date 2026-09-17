# RP04 — render từ cảnh Blender thật

![Blender Cycles, không phải ảnh game](market-interior-cycles-3840x2160.png)

Ảnh 3840×2160 được render ngày 10/09/2026 từ `art-source/harbor-v2/container-bd/container-bd-market-rp04.blend` bằng `tools/harbor-v2/render_market_rp04.py`. Cycles, 48 samples, adaptive threshold 0,035, denoise, AgX; GPU Apple M4 10 cores qua Metal. Tiến trình nền kết thúc thành công, không lưu đè file Blender và không dùng Brev.

Camera tương ứng góc Interior trong game: vị trí Three.js (45; 1,85; -33,4), nhìn về (45; 1,35; -42,5), FOV đứng 70°. Chỉ render LOD0, tắt các collection collision/reference/preview. Ánh sáng bầu trời HDR và bounce từ đèn emissive là thiết lập review offline, không được chuyển nguyên vẹn qua GLB.

Ảnh có chiều sâu và bóng gián tiếp nhưng vẫn còn chất liệu/kệ đơn giản, hàng hóa lặp, room exposure tối và các dãy chai tủ lạnh dạng atlas. Không gọi đây là hoàn thiện photorealistic. Độ phân giải 4K của ảnh không chứng minh game chạy 4K/60 FPS; xem ảnh Three.js và số đo riêng trong [báo cáo runtime](../candidate-reviewed/README.md).
