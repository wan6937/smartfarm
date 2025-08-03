/**
 * 스마트팜 웹 인터페이스 제어 스크립트
 * - MQTT를 통한 실시간 센서 데이터 수신
 * - LED 장치 원격 제어
 * - 실시간 상태 모니터링
 */

//=============== 설정 ===============//

// API 엔드포인트 설정
const API_ENDPOINT = 'http://farmsmart.duckdns.org:3000';

// MQTT 클라이언트 설정
const mqttConfig = {
    hostname: 'farmsmart.duckdns.org',
    port: 8080,
    clientId: 'webClient_' + Math.random().toString(16).substr(2, 8),
    protocol: 'wss'
};

// MQTT 토픽 정의
const MQTT_TOPICS = {
    scd41: 'FarmSmart/SCDsensor/pub',
    waterTemp: 'FarmSmart/watertemp/pub',  // 수온 센서 토픽
    ph: 'FarmSmart/ph/pub',                // pH 센서 토픽
    ec: 'FarmSmart/ec/pub',                // EC 센서 토픽
    aquarium: 'FarmSmart/aquariumSensor/pub',  // 기존 수조 센서 토픽
    control: {
        aquariumLight: 'FarmSmart/aquariumLight/sub',
        plantLight1: 'FarmSmart/plantLight1/sub',
        plantLight2: 'FarmSmart/plantLight2/sub',
        upMotor: 'FarmSmart/upMotor/sub'
    },
    status: {
        aquariumLight: 'FarmSmart/aquariumLight/status',
        plantLight1: 'FarmSmart/plantLight1/status',
        plantLight2: 'FarmSmart/plantLight2/status',
        upMotor: 'FarmSmart/upMotor/status',
        system: 'FarmSmart/system/status'  // 시스템 상태 토픽 추가
    },
    request: {
        status: 'FarmSmart/request/status'
    }
};

//=============== 상태 관리 ===============//

// 센서 데이터 상태
let sensorData = {
    temperature: '--',
    humidity: '--',
    co2: '--',
    waterTemp: '--',
    ph: '--',
    ec: '--'
};

// 장비 상태 저장
const deviceStatus = {
    aquariumLight: false,
    plantLight1: false,
    plantLight2: false,
    upMotor: false
};

// 시스템 상태 저장
const systemStatus = {
    emergency: false,
    recovery: false
};

//=============== DOM 요소 ===============//

// 제어 버튼
const controlButtons = document.querySelectorAll('.control-btn');

// 상태 표시 요소
const statusMessage = document.querySelector('.subtitle');
const sensorValues = document.querySelectorAll('.sensor-card .value');
const lastUpdateTime = document.querySelector('.last-update');

//=============== UI 업데이트 함수 ===============//

/**
 * 연결 상태 메시지 업데이트
 * @param {string} message - 표시할 메시지
 * @param {string} color - 메시지 색상 (hex 코드)
 */
function updateConnectionStatus(message, color) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = color;
    }
}

/**
 * 버튼 초기화
 * 버튼 라벨 설정 및 초기 상태 반영
 */
function initializeButtons() {
    // LED 제어 버튼 초기화
    const ledButtons = document.querySelectorAll('.control-section:nth-of-type(1) .control-btn');
    const ledLabels = ['어항등', '식물등1', '식물등2'];
    ledButtons.forEach((button, index) => {
        button.textContent = ledLabels[index];
        updateButtonState(index, deviceStatus[Object.keys(deviceStatus)[index]]);
    });
    
    // 모터 제어 버튼 초기화
    const motorButtons = document.querySelectorAll('.control-section:nth-of-type(2) .control-btn');
    if (motorButtons.length > 0) {
        motorButtons[0].textContent = 'UP 모터';
        updateMotorButtonState(0, deviceStatus.upMotor);
    }
}

/**
 * 버튼 상태 업데이트
 * @param {number} index - 버튼 인덱스
 * @param {boolean} isOn - 켜짐/꺼짐 상태
 */
function updateButtonState(index, isOn) {
    if (controlButtons[index]) {
        controlButtons[index].classList.toggle('active', isOn);
        const devices = ['aquariumLight', 'plantLight1', 'plantLight2'];
        deviceStatus[devices[index]] = isOn;
    }
}

/**
 * 센서 데이터 화면 업데이트
 */
function updateSensorDisplay() {
    console.log('화면 업데이트 시작');
    
    // 대기 환경
    document.getElementById('temperature').textContent = sensorData.temperature;
    document.getElementById('humidity').textContent = sensorData.humidity;
    document.getElementById('co2').textContent = sensorData.co2;
    
    // 수조 환경
    document.getElementById('water-temp').textContent = sensorData.waterTemp;
    document.getElementById('ph').textContent = sensorData.ph;
    document.getElementById('ec').textContent = sensorData.ec;
    
    console.log('화면 업데이트 완료:', sensorData);
}

/**
 * 마지막 업데이트 시간 표시
 */
function updateLastUpdateTime() {
    const lastUpdateElement = document.getElementById('last-update');
    if (lastUpdateElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ko-KR');
        lastUpdateElement.textContent = timeString;
    }
}

//=============== MQTT 통신 ===============//

// MQTT 클라이언트 연결
const mqttClient = mqtt.connect(`wss://${mqttConfig.hostname}:${mqttConfig.port}/mqtt`, {
    clientId: mqttConfig.clientId,
    clean: true,
    protocol: mqttConfig.protocol,
    reconnectPeriod: 1000
});

// MQTT 연결 이벤트 핸들러
mqttClient.on('connect', () => {
    console.log('MQTT 연결 성공');
    console.log('구독할 토픽:', [
        MQTT_TOPICS.scd41,
        MQTT_TOPICS.waterTemp,  
        MQTT_TOPICS.ph,         
        MQTT_TOPICS.ec,         
        MQTT_TOPICS.aquarium,
        MQTT_TOPICS.status.aquariumLight,
        MQTT_TOPICS.status.plantLight1,
        MQTT_TOPICS.status.plantLight2,
        MQTT_TOPICS.status.upMotor,
        MQTT_TOPICS.status.system  
    ]);
    
    updateConnectionStatus('연결됨', '#28a745');

    // 토픽 구독
    mqttClient.subscribe([
        MQTT_TOPICS.scd41,
        MQTT_TOPICS.waterTemp,  
        MQTT_TOPICS.ph,         
        MQTT_TOPICS.ec,         
        MQTT_TOPICS.aquarium,
        MQTT_TOPICS.status.aquariumLight,
        MQTT_TOPICS.status.plantLight1,
        MQTT_TOPICS.status.plantLight2,
        MQTT_TOPICS.status.upMotor,
        MQTT_TOPICS.status.system  
    ], (err) => {
        if (err) {
            console.error('토픽 구독 실패:', err);
        } else {
            console.log('토픽 구독 성공');
        }
    });

    // 현재 장비 상태 요청
    mqttClient.publish(MQTT_TOPICS.request.status, 'all');
});

mqttClient.on('error', (err) => {
    console.error('MQTT Error:', err);
    updateConnectionStatus('MQTT connection error', '#dc3545');
});

mqttClient.on('close', () => {
    console.log('MQTT Connection closed');
    updateConnectionStatus('MQTT connection closed', '#dc3545');
});

// 연결 종료 이벤트 핸들러
mqttClient.on('close', () => {
    console.log('MQTT 연결이 종료되었습니다.');
    updateConnectionStatus('서버 연결 끊김', '#e74c3c');
});

// 에러 이벤트 핸들러
mqttClient.on('error', (error) => {
    console.error('MQTT 연결 오류:', error);
    updateConnectionStatus('연결 오류 발생', '#e74c3c');
});

// 재연결 이벤트 핸들러
mqttClient.on('reconnect', () => {
    console.log('MQTT 서버에 재연결 중...');
    updateConnectionStatus('서버에 재연결 중...', '#f39c12');
});

// 메시지 수신 이벤트 핸들러
mqttClient.on('message', (topic, message) => {
    console.log('MQTT 메시지 수신:', topic, message.toString());
    
    // 시스템 상태 메시지 처리 (JSON 형식)
    if (topic === MQTT_TOPICS.status.system) {
        try {
            const data = JSON.parse(message.toString());
            
            // 모든 시스템 상태 초기화
            systemStatus.emergency = false;
            systemStatus.recovery = false;
            
            // 수신된 상태 활성화
            if (data.status === 'emergency') {
                systemStatus.emergency = true;
            } else if (data.status === 'recovery') {
                systemStatus.recovery = true;
            }
            
            // 상태 버튼 업데이트
            updateSystemStatusButtons();
            
            // 상태를 로컬 스토리지에 저장
            localStorage.setItem('systemStatus', JSON.stringify(systemStatus));
            
            console.log('시스템 상태 업데이트:', data.status, '타임스탬프:', data.timestamp);
        } catch (error) {
            console.error('시스템 상태 메시지 파싱 오류:', error);
        }
        return; // 시스템 상태 처리 후 함수 종료
    }
    
    // 다른 메시지들은 JSON으로 파싱 시도
    try {
        const data = JSON.parse(message.toString());
        
        // SCD41 센서 데이터 처리
        if (topic === MQTT_TOPICS.scd41) {
            console.log('SCD41 데이터 처리 시작');
            console.log('원본 데이터:', data);
            
            // 유효한 숫자인지 확인 후 처리
            sensorData.temperature = !isNaN(data.temperature) ? Number(data.temperature).toFixed(1) : '--';
            sensorData.humidity = !isNaN(data.humidity) ? Number(data.humidity).toFixed(1) : '--';
            sensorData.co2 = !isNaN(data.co2) ? Number(data.co2).toFixed(0) : '--';
            
            console.log('처리된 데이터:', sensorData);
            updateSensorDisplay();  // 센서 데이터 화면 업데이트
            updateLastUpdateTime(); // 시간 업데이트
            console.log('화면 업데이트 완료');
        }
        
        // 수온 센서 데이터 처리
        else if (topic === MQTT_TOPICS.waterTemp) {
            console.log('수온 데이터 처리:', data);
            // 다양한 데이터 형식 처리
            let tempValue;
            if (data.value !== undefined) {
                tempValue = !isNaN(data.value) ? Number(data.value) : null;
            } else if (data.temperature !== undefined) {
                tempValue = !isNaN(data.temperature) ? Number(data.temperature) : null;
            } else if (!isNaN(data)) {
                tempValue = Number(data);
            }
            
            // 수온 값을 10으로 나눔
            if (tempValue !== null) {
                tempValue = tempValue / 10;
                sensorData.waterTemp = tempValue.toFixed(1);
            } else {
                sensorData.waterTemp = '--';
            }
            
            updateSensorDisplay();  // 센서 데이터 화면 업데이트
            updateLastUpdateTime(); // 시간 업데이트
        }
        
        // pH 센서 데이터 처리
        else if (topic === MQTT_TOPICS.ph) {
            console.log('pH 데이터 처리:', data);
            // 다양한 데이터 형식 처리
            let phValue;
            if (data.value !== undefined) {
                phValue = !isNaN(data.value) ? Number(data.value) : null;
            } else if (data.ph !== undefined) {
                phValue = !isNaN(data.ph) ? Number(data.ph) : null;
            } else if (!isNaN(data)) {
                phValue = Number(data);
            }
            
            // pH 값을 100으로 나눔
            if (phValue !== null) {
                phValue = phValue / 100;
                sensorData.ph = phValue.toFixed(2);
            } else {
                sensorData.ph = '--';
            }
            
            updateSensorDisplay();  // 센서 데이터 화면 업데이트
            updateLastUpdateTime(); // 시간 업데이트
        }
        
        // EC 센서 데이터 처리
        else if (topic === MQTT_TOPICS.ec) {
            console.log('EC 데이터 처리:', data);
            // 다양한 데이터 형식 처리
            if (data.value !== undefined) {
                sensorData.ec = !isNaN(data.value) ? Number(data.value).toFixed(0) : '--';
            } else if (data.ec !== undefined) {
                sensorData.ec = !isNaN(data.ec) ? Number(data.ec).toFixed(0) : '--';
            } else if (!isNaN(data)) {
                sensorData.ec = Number(data).toFixed(0);
            }
            updateSensorDisplay();  // 센서 데이터 화면 업데이트
            updateLastUpdateTime(); // 시간 업데이트
        }
        
        // 수조 센서 데이터 처리
        else if (topic === MQTT_TOPICS.aquarium) {
            sensorData.waterTemp = data.temperature.toFixed(1);
            sensorData.ph = data.ph.toFixed(2);
            sensorData.ec = data.ec.toFixed(0);
            updateSensorDisplay();  // 센서 데이터 화면 업데이트
            updateLastUpdateTime(); // 시간 업데이트
        }
        
        // 장치 상태 업데이트 처리
        else if (Object.values(MQTT_TOPICS.status).includes(topic)) {
            const device = Object.keys(MQTT_TOPICS.status).find(key => MQTT_TOPICS.status[key] === topic);
            if (device && device !== 'system') { // 시스템 상태는 이미 위에서 처리했으므로 제외
                deviceStatus[device] = message.toString() === '1';
                if (device === 'upMotor') {
                    updateMotorButtonState(0, deviceStatus[device]);
                } else {
                    const index = Object.keys(deviceStatus).indexOf(device);
                    updateButtonState(index, deviceStatus[device]);
                }
            }
        }
    } catch (error) {
        console.error('메시지 처리 중 오류:', error);
        
        // JSON 파싱 실패 시 단순 문자열 메시지 처리 (장치 상태 등)
        if (Object.values(MQTT_TOPICS.status).includes(topic)) {
            const device = Object.keys(MQTT_TOPICS.status).find(key => MQTT_TOPICS.status[key] === topic);
            if (device && device !== 'system') { // 시스템 상태는 이미 위에서 처리했으므로 제외
                deviceStatus[device] = message.toString() === '1';
                if (device === 'upMotor') {
                    updateMotorButtonState(0, deviceStatus[device]);
                } else {
                    const index = Object.keys(deviceStatus).indexOf(device);
                    updateButtonState(index, deviceStatus[device]);
                }
            }
        }
    }
});

//=============== 장치 제어 ===============//

/**
 * 장치 상태 토글
 * @param {number} index - 장치 인덱스
 */
function toggleDevice(index) {
    const devices = ['aquariumLight', 'plantLight1', 'plantLight2'];
    const device = devices[index];
    
    if (device && MQTT_TOPICS.control[device]) {
        const newState = !deviceStatus[device];
        mqttClient.publish(MQTT_TOPICS.control[device], newState ? '1' : '0');
    }
}

/**
 * 모터 상태 토글 함수
 * @param {number} index - 모터 인덱스 (0: UP 모터)
 */
function toggleMotor(index) {
    if (!mqttClient || !mqttClient.connected) {
        showAlert('MQTT 서버에 연결되어 있지 않습니다.', 'danger');
        return;
    }
    
    const motorState = deviceStatus.upMotor;
    const newState = !motorState;
    
    // MQTT로 모터 제어 명령 전송 (원래 형식으로 복원)
    mqttClient.publish(MQTT_TOPICS.control.upMotor, newState ? '1' : '0', { qos: 1 });
    console.log(`UP 모터 ${newState ? '켜기' : '끄기'} 명령 전송`);
    
    // 모터를 켜면 RECOVERY 상태 해제 (정상 상태로 복귀)
    if (newState && systemStatus.recovery) {
        systemStatus.recovery = false;
        updateSystemStatusButtons();
        
        // 로컬 스토리지 업데이트
        localStorage.setItem('systemStatus', JSON.stringify(systemStatus));
        console.log('모터 작동으로 RECOVERY 상태 해제');
    }
}

/**
 * 모터 버튼 상태 업데이트
 * @param {number} index - 모터 인덱스 (0: UP 모터)
 * @param {boolean} isOn - 켜짐/꺼짐 상태
 */
function updateMotorButtonState(index, isOn) {
    // 모터 제어 버튼 요소 가져오기
    const motorButtons = document.querySelectorAll('.control-section:nth-of-type(2) .control-btn');
    
    if (motorButtons && motorButtons[index]) {
        motorButtons[index].classList.toggle('active', isOn);
        
        // UP 모터 상태 업데이트
        if (index === 0) {
            deviceStatus.upMotor = isOn;
        }
    }
}

//=============== 데이터베이스 조회 기능 ===============//

/**
 * 환경 데이터 조회
 */
async function fetchEnvironmentData() {
    try {
        const response = await fetch(`${API_ENDPOINT}/api/environment`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data && data.length > 0) {
            const latestData = data[0];
            
            // 센서 데이터 업데이트
            const temperatureElement = document.getElementById('temperature');
            const humidityElement = document.getElementById('humidity');
            const co2Element = document.getElementById('co2');
            const waterTempElement = document.getElementById('water-temp');
            const phElement = document.getElementById('ph');
            const ecElement = document.getElementById('ec');

            if (temperatureElement) temperatureElement.textContent = Number(latestData.temperature).toFixed(1);
            if (humidityElement) humidityElement.textContent = Number(latestData.humidity).toFixed(1);
            if (co2Element) co2Element.textContent = Number(latestData.co2).toFixed(0);
            if (waterTempElement) waterTempElement.textContent = Number(latestData.waterTemp).toFixed(1);
            if (phElement) phElement.textContent = Number(latestData.ph).toFixed(2);
            if (ecElement) ecElement.textContent = Number(latestData.ec).toFixed(0);

            updateLastUpdateTime();
        }
    } catch (error) {
        console.error('데이터 조회 중 오류 발생:', error);
    }
}

//=============== 이벤트 리스너 ===============//

// 버튼 클릭 이벤트 리스너 등록
controlButtons.forEach((button, index) => {
    button.addEventListener('click', () => toggleDevice(index));
});

// 모터 버튼 클릭 이벤트 리스너 등록
document.querySelectorAll('.control-section:nth-of-type(2) .control-btn').forEach((button, index) => {
    button.addEventListener('click', () => toggleMotor(index));
});

// 페이지 로드 시 초기 데이터 조회
document.addEventListener('DOMContentLoaded', () => {
    // 기존 초기화 코드
    initializeButtons();
    
    // 시스템 상태 초기화 (EMERGENCY와 RECOVERY 모두 비활성화)
    systemStatus.emergency = false;
    systemStatus.recovery = false;
    
    // 로컬 스토리지에 초기화된 상태 저장
    localStorage.setItem('systemStatus', JSON.stringify(systemStatus));
    
    // 시스템 상태 버튼 업데이트
    updateSystemStatusButtons();
    console.log('시스템 상태 초기화:', systemStatus);
    
    // 환경 데이터 초기 로드
    fetchEnvironmentData();
});

// EMERGENCY 버튼 클릭 이벤트 핸들러 추가
document.getElementById('emergency-status').addEventListener('click', function() {
    systemStatus.emergency = !systemStatus.emergency;
    
    // EMERGENCY가 활성화되면 RECOVERY는 비활성화
    if (systemStatus.emergency) {
        systemStatus.recovery = false;
    }
    
    // 로컬 스토리지에 상태 저장
    localStorage.setItem('systemStatus', JSON.stringify(systemStatus));
    
    // 버튼 상태 업데이트
    updateSystemStatusButtons();
    console.log('EMERGENCY 상태 변경:', systemStatus.emergency);
});

// RECOVERY 버튼 클릭 이벤트 핸들러 추가
document.getElementById('recovery-status').addEventListener('click', function() {
    systemStatus.recovery = !systemStatus.recovery;
    
    // RECOVERY가 활성화되면 EMERGENCY는 비활성화
    if (systemStatus.recovery) {
        systemStatus.emergency = false;
    }
    
    // 로컬 스토리지에 상태 저장
    localStorage.setItem('systemStatus', JSON.stringify(systemStatus));
    
    // 버튼 상태 업데이트
    updateSystemStatusButtons();
    console.log('RECOVERY 상태 변경:', systemStatus.recovery);
});

// 시스템 상태 버튼 업데이트
function updateSystemStatusButtons() {
    const emergencyBtn = document.getElementById('emergency-status');
    const recoveryBtn = document.getElementById('recovery-status');
    
    if (emergencyBtn && recoveryBtn) {
        // Emergency 버튼 상태 업데이트
        emergencyBtn.classList.toggle('active', systemStatus.emergency);
        
        // Recovery 버튼 상태 업데이트
        recoveryBtn.classList.toggle('active', systemStatus.recovery);
        
        console.log('시스템 상태 업데이트:', systemStatus);
    }
}