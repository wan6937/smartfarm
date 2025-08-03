# 스마트팜 제어 시스템

## 개요
Arduino UNO R4 WiFi 기반의 스마트팜 통합 제어 스케치입니다.  
센서 데이터 수집, 모터 및 LED 제어, MQTT 통신, 비상 정지/복구를 포함합니다.

## 기능
- SCD41 센서로 온도, 습도, CO2 측정
- 수위 센서에 따라 A/B 탱크 모터 제어
- 어항 및 식물 LED 원격 제어
- MQTT로 상태와 센서 데이터 전송
- 비상 정지 및 자동 복구

## 하드웨어
- 보드: Arduino UNO R4 WiFi  
- 센서: SCD41  
- 액추에이터
  - A탱크 공급 모터: 핀 6  
  - B탱크 배출 모터: 핀 5  
  - B탱크 수위 센서: 핀 4  
  - 식물 LED 1: 핀 9  
  - 식물 LED 2: 핀 10  
  - 어항 LED: 핀 11  

## 라이브러리
- WiFiS3  
- PubSubClient  
- Wire (기본 포함)  
- SparkFun_SCD4x_Arduino_Library  
- ArduinoJson  
