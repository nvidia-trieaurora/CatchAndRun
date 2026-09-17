# RP04 — kiểm tra trực tiếp trong game

Các PNG ở đây là ảnh Three.js 1600×900 từ Chrome, không phải ảnh AI hoặc render Unreal. Mỗi lượt dùng profile/phòng solo riêng, cùng camera và source. CDP nạp một lần rồi chuyển đúng bytes candidate vào trình duyệt; SHA trong JSON là hash của bytes đã render, không phải lần tải khác sau khi chụp.

Candidate Market: `3e593113f9e820e80d24430b736adda7e22ae9f28ed350065a85be26db1a8ca5`, 6.001.596 bytes. Có đủ chín asset; tám GLB ngoài Market giữ nguyên. Source hash: `2449157375bbfb905e0a4bb34552644cfa9c5e492fc102fec03f38eab49feeea`.

## Ảnh High

![Mặt tiền thật trong game](rp04-webgpu-high-harborMarketFront.png)

![Nội thất thật trong game](rp04-webgpu-high-harborMarketInterior.png)

Các góc [bao quát](rp04-webgpu-high-harborMarketExterior.png), [kệ hàng](rp04-webgpu-high-harborMarketShelf.png), [tủ lạnh](rp04-webgpu-high-harborMarketFridge.png) và [WebGL High](rp04-webgl2-high-harborMarketInterior.png) cũng được xem trực tiếp. Kính có thể nhìn qua nhưng vẫn có collision; lối giữa kệ/qua cửa không đổi. Trần mới không nhô vào khoảng đầu nhân vật.

## Hiệu năng, không chỉ FPS trung bình

Mẫu tĩnh 4 giây, quay 360° 4 giây, settle 16 giây. Không chạy Blender render/test suite đồng thời với đo. Âm thanh tắt; đây không phải bài thử laptop/mobile/4K hay trận nhiều người.

| Backend / tier | FPS tĩnh Front / Interior | FPS pan Front / Interior | Pan max Front / Interior | Frame pan >50 ms |
| --- | ---: | ---: | ---: | ---: |
| WebGPU High | 53,2 / 60,0 | 59,3 / 58,3 | 33,3 / 33,4 ms | 0 / 0 |
| WebGPU Low | 60,0 / 59,8 | 60,0 / 60,0 | 16,8 / 16,8 ms | 0 / 0 |
| WebGL2 High | 43,0 / 45,0 | 33,9 / 37,1 | 283,3 / 50,1 ms | 6 / 2 |
| WebGL2 Low | 59,8 / 60,0 | 59,5 / 59,0 | 33,3 / 33,4 ms | 0 / 0 |

High WebGPU vẫn có spike ở mẫu tĩnh Front (183,2 ms, 3 frame >50 ms) và Exterior (116,6 ms, 1 frame >50 ms). Năm mẫu pan High WebGPU không có frame >50 ms, nhưng không được diễn đạt thành “mọi góc đã hết lag”.

So đối chiếu cùng code với GLB Market cũ trên WebGL2 High: tĩnh Front/Interior 43,6/50,3 FPS; pan 41,8/41,3 FPS, max66,7/50,1 ms. Art candidate chưa đạt ngang baseline ở mọi mẫu WebGL2 High, đặc biệt pan đầu. Đây là giới hạn hiệu năng còn mở, không phải kết quả pass60FPS. Đối chiếu ngắn không kiểm soát được toàn bộ tải nền/nhiệt máy.

Đã kiểm tra lại cùng chuỗi năm góc và bắn: candidate **giữ nguyên hai đèn** đạt coast59,75FPS/max33,3ms/0 frame >50ms và wall54,18FPS; production cùng chuỗi đạt coast59,75 và wall50,85FPS. Thử tắt đèn không giải quyết chậm cuối phiên. Vì vậy không kết luận hai đèn gây hồi quy chỉ từ lượt đầu, cũng không bỏ các mẫu xấu để tuyên bố hết lag. [Đối chiếu chi tiết](../diagnostic-no-practicals/README.md).

Bắn High WebGPU: 44 impact vào nước, không sinh lỗ đạn trên nước; 40 phát vào tường, dấu lớn nhất 0,130 m. Tuy vậy, firing-coast chỉ46,4 FPS, max199,9 ms và13 frame >50 ms trong12 giây; firing-wall43,4 FPS, max66,7 ms và3 frame >50 ms. Kích thước dấu đã đạt bài thử, hiệu năng nước/bắn chưa được coi là hoàn tất.

## Hạn chế thị giác

Low vẫn dùng các khối/kệ và dãy tủ lạnh giản lược có sẵn. Ảnh Low có container ở mép phải che một phần góc camera mặt tiền; không dùng ảnh High để che giấu khác biệt này. Low không được coi là hoàn thiện photorealistic. High có chi tiết tốt hơn nhưng vẫn chưa giống hoàn toàn concept cinematic: cần thêm light baking, biến thể sản phẩm và xử lý các đường ghép ở góc cận.

`consoleErrors` rỗng trên bốn tổ hợp nhưng không có nghĩa raw logs hoàn toàn sạch: script lọc riêng lỗi quyền pointer-lock/microphone. Mỗi report giữ hai `WrongDocumentError` về pointer lock cùng cảnh báo microphone bị từ chối trong phiên headless. Không ghi nhận lỗi tải GLB/shader trong các mẫu này; tương tác chuột/voice bằng cửa sổ có người dùng thật chưa được chứng minh. Sự tương thích render và kiểm tra vật lý có phạm vi được ghi nhận riêng với mục tiêu mỹ thuật/performance còn mở.
