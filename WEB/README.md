# Web Dashboard

## 개요
라즈베리파이를 백엔드로 사용하여 스마트팜의 실시간 환경 상태를 보여주고 기록을 조회할 수 있는 웹 인터페이스입니다.

## 주요 파일
- `smartfarm_dashboard.html`: 실시간 센서 데이터 및 상태를 시각화하는 메인 대시보드  
- `environmental_records.html`: 과거 환경 기록(로그)을 조회하는 페이지  
- `smartfarm_dashboard.js`: 대시보드 UI 업데이트 및 제어 로직  
- `environmental_records.js`: 기록 페이지 데이터 처리 및 표시  
- `styles.css`: UI 스타일  
- `raspberrypi_server.js`: 라즈베리파이(Node.js)에서 데이터를 제공하거나 정적 파일을 서빙하는 백엔드 스크립트

## 사용 방법

### 1. 로컬에서 보기
- `smartfarm_dashboard.html` 또는 `environmental_records.html`을 브라우저에서 직접 열어 확인할 수 있습니다.  
  (실시간 연동은 MQTT 또는 백엔드가 활성화된 상태가 필요합니다.)

### 2. 서버와 함께 사용
- 라즈베리파이 또는 Node.js 환경에서 `raspberrypi_server.js`를 실행하여 API/정적 콘텐츠를 서빙합니다. 
