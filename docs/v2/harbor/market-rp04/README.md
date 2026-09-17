# Harbor Market RP04 — Blender → game

> **Trạng thái repository (2026-09-17):** RP04 và các quality pass kế tiếp đã
> được hợp nhất vào `main` tại `d796c8f`. Nội dung “chưa commit/deploy” bên dưới
> là ghi chú lịch sử của lần promotion local; deployment online chưa được tài
> liệu này xác minh.

Đợt triển khai khu mẫu đầu tiên sau khi duyệt 12 concept. Phạm vi mỹ thuật là cửa hàng Market; không phải 12 khu đã được dựng lại và không chuyển game sang Unreal.

**Đã tích hợp vào game local ngày 10/09/2026.** `client/public/assets/maps/harbor-v2/zones/container-bd.glb` hiện là RP04, SHA256 `3e593113f9e820e80d24430b736adda7e22ae9f28ed350065a85be26db1a8ca5`. URL trong code có version mới để tránh dùng lại cache. [Biên bản thay asset và bản sao khôi phục](promotion.json) · [Đối chiếu bytes URL production trả về](served-production.json). Chỉ thay GLB Market/container-bd; tám GLB khác không đổi. Chưa commit hoặc deploy.

## Thay đổi

- Sàn đá mài, tường/trần sơn và gỗ có UV theo mét, roughness/normal riêng; không dán ảnh concept lên hình khối.
- Bộ bao bì Harbor gốc với nhãn sản phẩm, barcode và dãy hàng tủ lạnh; master 2048px, runtime 1024px.
- Biển HARBOR MARKET trong nhà, khung trần, miệng gió, nẹp chân tường, gỗ khu rau và nhãn giá gắn vào kệ.
- Hai đèn thực dụng có phạm vi 8 m dưới panel trần, không shadow; Low không thêm đèn này.
- Sửa loader chọn LOD theo node/Group của GLB nhiều material; không còn để Low đặc che High có hàng hóa.
- Chuẩn bị shader của các mesh hiện dùng trước khi nhìn tới góc mới. [Đo A/B và đánh đổi lúc tải](warmup/README.md).

## Nguồn và ngân sách

Nguồn gốc `container-bd-market-rp03.blend` được giữ nguyên. Bản RP04 ở `art-source/harbor-v2/container-bd/container-bd-market-rp04.blend`; khi kiểm tra trong Blender chỉ bật một collection RENDER_LOD tại một thời điểm.

Giữ nguyên 224 collision/reference/rig nodes và 8.951 mặt ngoài phạm vi Market, gồm UV/màu/material binding. Không thêm collider hoặc vật cản lớn. High 61.088 tam giác / 20 lượt vẽ; Low 5.582 / 9. Texture ước tính 26,28 MiB — vẫn dưới giới hạn 28 MiB có trước; tối đa texture runtime 1024px. Đây là số toàn asset container-bd, không phải tổng đảo.

Trần âm sâu 12 mm so với mặt dưới collider cũ; khung và khe gió không hạ xuống vùng đầu nhân vật. Regression mới cố tình hạ nẹp xuống 4 cm và kiểm tra nhảy bằng controller thật, bắt lỗi mà các điểm kiểm tra trần trước đó không thấy.

## Lặp lại quy trình

Chạy từ root, không chạy đồng thời với phiên đang sửa cùng file:

```sh
node tools/harbor-v2/prepare_market_rp04.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/harbor-v2/upgrade_market_rp04.py
node tools/harbor-v2/finalize_market_rp04.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/harbor-v2/validate_zone.py -- --glb art-source/harbor-v2/_staging/market-rp04/container-bd-runtime.glb --zone CONTAINER_BD --metrics art-source/harbor-v2/_staging/market-rp04/container-bd-runtime.metrics.json
node tools/harbor-v2/verify_asset_pipeline.mjs --asset-dir art-source/harbor-v2/_staging/market-rp04/assets
```

`finalize_market_rp04` tạo đủ 9 GLB trong cây candidate; chỉ Market khác production. Browser QA dùng `capture_runtime_review.mjs --candidate-root market-rp04/assets` để đổi URL qua CDP ở phiên thử riêng, không sửa fetch/gameplay hoặc asset production. Khởi động trang mới để tránh template cache. Không chạy render Blender đồng thời với phép đo FPS.

Sau duyệt hình và bốn tổ hợp backend/tier mới chạy `promote_market_rp04.mjs --gate <summary.json> --review <visual-review.json>`. Mọi thay đổi source/asset sau capture/gate đều cần kiểm tra lại. Script giữ rollback và đối chiếu đúng bytes trước khi thay `client/public`.

## Bằng chứng và giới hạn

- [Before: 5 góc trong trình duyệt](before/README.md).
- `candidate-01` là bản bị loại do lỗi chồng LOD; không dùng làm ảnh kết quả.
- `candidate-final` là bản trung gian trước sửa khe gió; không dùng để promote. `candidate-reviewed` là ma trận kiểm tra cuối, trạng thái promote được ghi ở `promotion.json` và `visual-review.json`.
- [Ma trận WebGPU/WebGL2 × High/Low, ảnh và số đo](candidate-reviewed/README.md): đã xem ảnh trực tiếp ở bốn tổ hợp, không ghi nhận lỗi tải asset/render. Công cụ loại lỗi quyền pointer-lock/microphone khỏi `consoleErrors`; các lỗi này vẫn nằm trong raw logs và chưa được kiểm chứng bằng tương tác thật. High vẫn còn các mẫu chậm và chưa giống hoàn toàn concept; không dùng kết quả tương thích để tuyên bố đạt photorealistic/60 FPS.
- [Ảnh sau tích hợp, dùng URL production trực tiếp](applied/README.md): không chuyển hướng candidate qua CDP. Đã xem lại cả Front và Interior trong game WebGPU High.
- [Gate ngay trước khi thay asset](gate-reviewed-02/summary.json): 86 static probes, 6 negative controls, 64 candidate controller cases, 88 client regression cases và 18 server cases. Full client suite cũng đã chạy 329/329 trước promotion; đây không phải kiểm chứng mọi tình huống trên đảo.
- [Gate sau khi thay asset](post-promotion-gate-02/summary.json) chạy lại trên chính 9 GLB trong `client/public`: `bounded-headless-pass`, đầy đủ 86 + 6 + 64 + 88 + 18. Trạng thái này vẫn không tự cấp phép bỏ bước browser/duyệt hình.
- [Render Blender 3840×2160](blender/market-interior-cycles-3840x2160.png) đã tạo từ RP04 thật bằng Cycles/Metal, 48 samples và denoise. Đây là **render tác giả từ Blender**, có ánh sáng gián tiếp offline; không phải ảnh Three.js hay bằng chứng game chạy 4K/60 FPS. [Thông số và giới hạn](blender/README.md).
- Các probes/controller có phạm vi hữu hạn. Chưa chứng minh mọi disguise, mọi điểm va chạm trên đảo, mọi GPU, mạng nhiều người hoặc toàn bộ đường leo thang.
- Warmup đổi lag góc đầu thành thời gian chuẩn bị lúc tải; lần render đầu còn có chi phí lớn, không tuyên bố đã tối ưu hoàn toàn.
- Các lượt gate bị timeout khi import `GameManagerCollisionLifecycle` được giữ lại, không đổi timeout hoặc bỏ test để làm xanh. Xem thư mục `gate-reviewed`, `post-promotion-gate` và lượt kiểm tra lại tương ứng; không dùng các summary thất bại làm bằng chứng pass.
- [Những tình huống cần kiểm tra tiếp](next-pass-verification.md): rider trên tất cả tàu/cabin, đồ rời trên boong chuyển động, multiplayer và các góc chưa nằm trong probes hiện tại.

Khu tiếp theo theo concept: tàu/mặt nước, nhà kho, sau đó các khu còn lại. Không dùng nguyên ánh sáng/shader Unreal làm GLB cho Three.js.
