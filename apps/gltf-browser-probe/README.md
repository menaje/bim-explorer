# glTF Browser probe

고정된 Khronos Box GLB를 Node의 bounded reference source로 투영한 뒤,
Browser에는 source snapshot과 derived geometry range만 제공하는 WebGL2
qualification surface입니다.

이 app은 실제 Chrome에서 rasterized pixels, source-native Pick ID,
selection highlight, bounded HTTP Range 요청과 GPU/session cleanup을
검증합니다. 원본 GLB route, upload, telemetry, BIM semantic authority와
제품 file-open은 제공하지 않습니다.
