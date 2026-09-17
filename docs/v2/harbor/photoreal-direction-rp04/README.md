# Harbor RP04 — duyệt hướng cinematic photorealistic

Ngày 10/09/2026. **Ảnh concept AI để duyệt; chưa phải đồ họa đã áp dụng vào game.**

Cập nhật sau duyệt: đã tích hợp khu mẫu [Harbor Market RP04](../market-rp04/README.md) và lượt [Fleet + nước RP04](../fleet-rp04/README.md) vào game local. Fleet mới bổ sung fittings trên năm tàu, tiếp xúc boong/đồ vật và bọt theo sóng; chưa đạt đầy đủ photorealistic. Các khu khác chưa được nâng cấp theo RP04. Các ảnh trong bộ này vẫn là concept; ảnh browser, render Blender4K và trạng thái tích hợp được ghi riêng ở từng báo cáo, không đồng nhất concept với runtime.

[Xem toàn bộ ảnh theo khu](GALLERY.md) · [Luồng kiểm tra chống xuyên vật thể](../asset-verification-rp04/README.md) · [Camera và ràng buộc từng khung](shot-contracts.json) · [Prompt, nguồn ảnh và trạng thái](generation-manifest.json)

## Hướng hình ảnh

Một cảng nhỏ đang hoạt động, sinh động nhờ cấu tạo và dấu vết sử dụng: tôn đỏ/nước sơn navy, thép mạ kẽm, gỗ ven biển, kính có chiều sâu; ánh nắng chiều ấm với ánh trời dịu. Khu làm việc có dụng cụ và hàng hóa hợp lý, không rải thùng ngẫu nhiên lấp tuyến chơi. Nước có sóng nhỏ, vệt ướt/bọt mỏng ở chân kè, không phủ bọt lên boong.

Ưu tiên những thứ nhìn thấy ở tầm mắt: khung kính, gioăng, độ dày mái, gối đỡ cầu thang, khe panel, tay nắm và silhouette hàng hóa. Texture độ phân giải cao không thể thay cho cấu tạo này.

## Các khu

- Tổng thể: giữ quan hệ nhà kho, vườn, đu quay, container, xưởng và bến.
- Harbor Market: ngoại thất và nội thất, hàng hóa/tủ lạnh có hình dáng thật.
- Nhà kho: tôn, skylight, cửa nhập hàng, cầu thang có chân và dầm đỡ.
- Công trường: vết cốp pha, mối nối thép, chân kích và dây treo có điểm neo.
- Xưởng điều hành: bàn sửa chữa, dụng cụ, điện/máng cáp và ánh sáng cửa.
- Nhà/vườn: vữa vôi, mái ngói, cửa âm, cây ven biển và hồ/đá.
- Quầy vé/đu quay: kính, bàn làm việc, khung thép, liên kết cabin.
- Tàu/nước: thân tàu có hình, boong khô, dây buộc, vệt mực nước.
- Sân cứu hộ: tháp quan sát, mái bảo trì, cradle cho xuồng và tuyến thông thoáng.
- Bãi container: corner casting, thanh khóa, nhịp tôn, đường giao nhận.
- Trạm Hunter: cửa mở theo vòng, ray cửa, khu dispatch và chuẩn bị.

## Từ ảnh sang asset

Ảnh là định hướng thị giác, **không phải bản vẽ kích thước hay mô phỏng vật lý**. Một số ảnh tự đổi kiểu cầu thang, thêm chữ/biển hoặc cửa sổ; ghi chú trong gallery/shot contract chỉ rõ phần phải bỏ khi dựng. Các cửa, mái, tuyến leo, pivot tàu/đu quay và collider hiện có vẫn là nguồn chuẩn cho gameplay.

Trình tự đã duyệt: Market → tàu/nước → warehouse → các khu còn lại. Market và lượt chi tiết Fleet đã tích hợp; warehouse là khu tiếp theo. Giữ camera từ `GameManager.ts`, xuất cùng aspect/FOV; so Blender và trình duyệt trước/sau. Mọi lượt tăng độ chân thực tiếp theo, kể cả chỉnh tiếp bề mặt cabin/nước, phải đi lại quy trình asset/va chạm/hình ảnh.

- **Blender:** nguồn model/UV/normal/ORM/LOD và collision. Xuất bản staging riêng, giữ file gốc.
- **Unreal:** project thử ánh sáng/camera riêng; render tham khảo, không giả định ánh sáng/shader hay collision sẽ đi nguyên vẹn qua GLB sang game web.
- **Three.js:** runtime hiện tại, cần tái tạo vật liệu/ánh sáng/nước phù hợp trình duyệt và đo thật sau tích hợp.

Không chuyển engine, thay GLB hoặc sửa gameplay trong lượt concept/gate này. UE chưa được mở để render bộ ảnh này; kiểm tra trước đó còn thiếu Metal Toolchain, xem lịch sử trong `status.json`.

## Kiểm chứng

Đã thêm lệnh chạy thực tế `npm run harbor:v2:verify-assets` cùng các test cố tình bỏ collider, thêm vật cản vô hình và thay đổi báo cáo. Cả asset lẫn source/report được gắn SHA256; báo cáo xanh cũ không được dùng sau khi dữ liệu thay đổi.

Kết quả tĩnh/controller không thay thế kiểm tra góc nhìn, ánh sáng, alpha theo texture, âm thanh, mạng hay GPU/frametime. Luồng có bước browser và duyệt hình riêng trước khi thay asset; xem [phạm vi và bằng chứng](../asset-verification-rp04/README.md).

Bộ ảnh dùng công cụ tạo ảnh tích hợp, không cần bạn đưa API key riêng và không dùng GPU Brev. PNG gốc hiện ở 1672×941, **không gắn nhãn 4K**. Render 3840×2160 từ cảnh Blender/UE hoàn chỉnh là một bước sau, không phải bằng chứng game chạy 4K/60 FPS.

Các prompt nhiều-panel cũ trong `prompts.json` được giữ làm lịch sử; đầu ra cuối cùng và prompt thực dùng phải đọc trong `generation-manifest.json`.
