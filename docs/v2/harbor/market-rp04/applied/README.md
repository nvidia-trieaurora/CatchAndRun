# Market RP04 — ảnh bản đã tích hợp

Chụp ngày 10/09/2026 tại `http://localhost:5174/?renderer=webgpu`, WebGPU High, Chrome headless 1600×900. Lần này **không dùng `--candidate-root` hoặc chuyển hướng GLB qua CDP**: trang tải asset production trong `client/public`. [HTTP bytes/hash đã đối chiếu](../served-production.json) · [Báo cáo browser nguyên bản](applied-webgpu-high-report.json) · [Gate production sau tích hợp](../post-promotion-gate-02/summary.json).

![Mặt tiền trong game đã tích hợp](applied-webgpu-high-harborMarketFront.png)

![Nội thất trong game đã tích hợp](applied-webgpu-high-harborMarketInterior.png)

Đã xem trực tiếp cả hai PNG. Kệ hàng/nhãn sản phẩm, biển hiệu trong nhà, sàn và khung trần RP04 xuất hiện đúng; không nhầm ảnh Cycles hoặc concept với runtime.

| Camera | FPS tĩnh / pan | Max tĩnh / pan | Frame >50 ms tĩnh / pan |
| --- | ---: | ---: | ---: |
| Front | 59,75 / 60,00 | 33,3 / 16,8 ms | 0 / 0 |
| Interior | 57,75 / 59,75 | 100,0 / 33,4 ms | 1 / 0 |

Đây là mẫu ngắn 4 giây sau settle 16 giây, chỉ hai camera và một backend/tier; vẫn có spike100ms Interior. Không chạy Blender render/test suite đồng thời. Không coi là pass60FPS toàn đảo hoặc phép đo 4K.

`consoleErrors` rỗng sau bộ lọc của công cụ; raw logs giữ hai exception `WrongDocumentError` khi headless xin pointer lock và cảnh báo microphone bị từ chối. Không dùng kết quả này để chứng nhận chuột/voice/multiplayer đã hoạt động đúng. Không chạy lại bài bắn/nước/tàu trong lượt chụp sau tích hợp này; xem [ma trận candidate và giới hạn](../candidate-reviewed/README.md).
