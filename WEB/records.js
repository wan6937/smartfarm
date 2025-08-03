// 차트 객체들을 저장할 변수
let charts = {
    temperatureChart: null,
    humidityChart: null,
    co2Chart: null,
    phChart: null,
    tdsChart: null
};

// 테이블에 표시할 데이터
let recordsData = [];

// URL 파라미터에서 데이터 타입 가져오기
function getDataTypeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const typeParam = urlParams.get('type');
    return typeParam === 'water' ? 'water' : 'air'; // 기본값은 'air'
}

// 현재 보여지는 데이터 유형 (대기 또는 수조)
let currentDataType = getDataTypeFromURL();

// 페이지 제목 업데이트
function updatePageTitle() {
    const pageTitle = document.getElementById('pageTitle');
    if (currentDataType === 'air') {
        pageTitle.textContent = '대기환경 데이터 기록';
    } else {
        pageTitle.textContent = '수조환경 데이터 기록';
    }
}

// 데이터 타입에 따라 테이블 헤더 업데이트
function updateTableHeader() {
    const tableHeader = document.getElementById('recordsHeader');
    if (currentDataType === 'air') {
        tableHeader.innerHTML = `
            <tr>
                <th>날짜</th>
                <th>시간</th>
                <th>온도 (°C)</th>
                <th>습도 (%)</th>
                <th>CO2 (ppm)</th>
            </tr>
        `;
    } else {
        tableHeader.innerHTML = `
            <tr>
                <th>날짜</th>
                <th>시간</th>
                <th>수온 (°C)</th>
                <th>pH</th>
                <th>EC (μS/cm)</th>
            </tr>
        `;
    }
}

// 차트 visibility 업데이트
function updateChartVisibility() {
    if (currentDataType === 'air') {
        document.getElementById('temperatureChartContainer').style.display = 'block';
        document.getElementById('humidityChartContainer').style.display = 'block';
        document.getElementById('co2ChartContainer').style.display = 'block';
        document.getElementById('phChartContainer').style.display = 'none';
        document.getElementById('tdsChartContainer').style.display = 'none';
    } else {
        document.getElementById('temperatureChartContainer').style.display = 'block';
        document.getElementById('humidityChartContainer').style.display = 'none';
        document.getElementById('co2ChartContainer').style.display = 'none';
        document.getElementById('phChartContainer').style.display = 'block';
        document.getElementById('tdsChartContainer').style.display = 'block';
    }
}

// 데이터 로드 및 초기 설정
async function loadData() {
    try {
        console.log(`데이터 유형 '${currentDataType}' 로드 시작`);
        
        // API 서버의 전체 URL을 사용
        // 만약 로컬에서 테스트 중이라면 적절한 서버 주소로 변경해야 합니다
        const apiUrl = window.location.hostname.includes('localhost') || window.location.protocol === 'file:' 
            ? `http://farmsmart.duckdns.org:3000/api/records?type=${currentDataType}&limit=1000`  // 개발/로컬 환경
            : `/api/records?type=${currentDataType}&limit=1000`;  // 프로덕션 환경
            
        console.log('API 요청 URL:', apiUrl);
        
        const response = await fetch(apiUrl);
        
        console.log('API 응답 상태:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`API 응답 오류: ${response.status} ${response.statusText}`);
        }
        
        // 응답 텍스트를 먼저 로그로 출력
        const responseText = await response.text();
        console.log('API 응답 텍스트:', responseText);
        
        // 텍스트를 JSON으로 변환
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON 파싱 오류:', e);
            throw new Error('API 응답을 JSON으로 파싱할 수 없습니다: ' + e.message);
        }
        
        console.log('API 응답 JSON:', result);
        console.log('데이터 유형:', currentDataType);
        
        // 데이터가 없거나 비어있는 경우 처리
        if (!result.records || result.records.length === 0) {
            console.warn(`${currentDataType} 데이터가 없습니다.`);
            // 테이블과 차트에 "데이터 없음" 표시
            document.getElementById('recordsBody').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px;">
                        데이터가 없습니다.
                    </td>
                </tr>
            `;
            // 차트 지우기
            Object.keys(charts).forEach(key => {
                if (charts[key]) {
                    charts[key].destroy();
                    charts[key] = null;
                }
            });
            return;
        }
        
        // API 응답 형식에 맞게 데이터 처리
        // 데이터 구조 디버깅
        console.log('첫 번째 레코드 구조:', Object.keys(result.records[0]));
        
        recordsData = result.records.map(record => {
            console.log('처리 중인 레코드:', record);
            
            // 레코드에 timestamp 필드가 있는지 확인
            if (!record.timestamp) {
                console.error('타임스탬프 필드가 없습니다:', record);
                return null;
            }
            
            // 타임스탬프를 Date 객체로 변환
            let date;
            try {
                date = new Date(record.timestamp);
                if (isNaN(date.getTime())) {
                    console.error('유효하지 않은 날짜 형식:', record.timestamp);
                    // 유효하지 않은 날짜라면 현재 시간 사용
                    date = new Date();
                }
            } catch (e) {
                console.error('날짜 변환 오류:', e, record.timestamp);
                date = new Date();
            }
            
            // 필드 매핑
            let formattedRecord = {
                date: date.toLocaleDateString(),
                time: date.toLocaleTimeString(),
            };
            
            // 데이터 유형에 따라 다른 필드 매핑
            if (currentDataType === 'air') {
                formattedRecord.temperature = record.temperature ? Number(record.temperature).toFixed(1) : 'N/A';
                formattedRecord.humidity = record.humidity ? Number(record.humidity).toFixed(1) : 'N/A';
                formattedRecord.co2 = record.co2 ? Number(record.co2).toFixed(0) : 'N/A';
            } else {
                // 수조환경 데이터 - 필드명 로깅
                console.log('수조환경 레코드 필드:', Object.keys(record));
                
                // 서버에서 watertemperature가 temperature로 별칭 지정되어 전달됨
                formattedRecord.temperature = record.temperature ? Number(record.temperature).toFixed(1) : 'N/A';
                formattedRecord.ph = record.ph ? Number(record.ph).toFixed(2) : 'N/A';
                formattedRecord.ec = record.ec ? Number(record.ec).toFixed(0) : 'N/A';
            }
            
            console.log('포맷된 레코드:', formattedRecord);
            return formattedRecord;
        }).filter(record => record !== null); // null 값 필터링
        
        console.log('처리된 데이터:', recordsData);
        
        // 데이터를 성공적으로 처리한 경우에만 테이블과 차트 업데이트
        if (recordsData.length > 0) {
            updateTable();
            createCharts();
        } else {
            console.warn('처리된 데이터가 없습니다.');
            document.getElementById('recordsBody').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px;">
                        처리된 데이터가 없습니다.
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        // 오류 발생 시 사용자에게 표시
        document.getElementById('recordsBody').innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: red;">
                    데이터 로드 중 오류가 발생했습니다: ${error.message}
                </td>
            </tr>
        `;
    }
}

// 그래프 생성
function createCharts() {
    // 기존 차트 제거
    Object.keys(charts).forEach(key => {
        if (charts[key]) {
            charts[key].destroy();
            charts[key] = null;
        }
    });
    
    // 차트용 데이터 준비 (최대 144개로 제한)
    let limitedData = recordsData.slice(0, 144);
    // 시간만 추출하여 레이블로 사용
    const labels = limitedData.map(record => {
        const timeOnly = record.time;
        return timeOnly;
    }).reverse();
    
    // 데이터 유형에 따라 다른 차트 생성
    if (currentDataType === 'air') {
        // 온도 차트
        const temperatureData = limitedData.map(record => record.temperature).reverse();
        charts.temperatureChart = createChart('temperatureChart', labels, temperatureData, '온도 (°C)', 'rgb(255, 99, 132)', '온도 변화');
        
        // 습도 차트
        const humidityData = limitedData.map(record => record.humidity).reverse();
        charts.humidityChart = createChart('humidityChart', labels, humidityData, '습도 (%)', 'rgb(54, 162, 235)', '습도 변화');
        
        // CO2 차트
        const co2Data = limitedData.map(record => record.co2).reverse();
        charts.co2Chart = createChart('co2Chart', labels, co2Data, 'CO2 (ppm)', 'rgb(75, 192, 192)', 'CO2 농도 변화');
    } else {
        // 수조 온도 차트
        const temperatureData = limitedData.map(record => record.temperature).reverse();
        charts.temperatureChart = createChart('temperatureChart', labels, temperatureData, '수온 (°C)', 'rgb(255, 0, 0)', '수온 변화');
        
        // pH 차트
        const phData = limitedData.map(record => record.ph).reverse();
        charts.phChart = createChart('phChart', labels, phData, 'pH', 'rgb(153, 102, 255)', 'pH 변화');
        
        // EC 차트
        const tdsData = limitedData.map(record => record.ec).reverse();
        charts.tdsChart = createChart('tdsChart', labels, tdsData, 'EC (μS/cm)', 'rgb(255, 159, 64)', 'EC 변화');
    }
}

function createChart(canvasId, labels, data, label, color, title) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // 8등분 지점 계산
    const totalPoints = labels.length;
    const segment = Math.floor(totalPoints / 8);
    
    // 색상 투명도 설정
    const fillColor = color.replace('rgb', 'rgba').replace(')', ', 0.2)');
    
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: fillColor,
                fill: true,
                tension: 0.4,
                borderWidth: 3, // 선 두께 증가
                pointRadius: 2, // 데이터 포인트 크기 조정
                pointHoverRadius: 6, // 호버 시 포인트 크기
                pointBackgroundColor: color, // 포인트 배경색을 그래프 색상과 동일하게 설정
                pointBorderColor: color, // 포인트 테두리 색상도 그래프 색상과 동일하게 설정
                pointBorderWidth: 1 // 포인트 테두리 두께 감소
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: '시간',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 12
                        },
                        color: '#666',
                        autoSkip: false, // 자동 건너뛰기 비활성화
                        callback: function(val, index) {
                            // 8개 구간으로 나누어 시간 표시
                            if (index === 0 || index === totalPoints - 1 || 
                                index === segment || index === segment * 2 || 
                                index === segment * 3 || index === segment * 4 || 
                                index === segment * 5 || index === segment * 6 || 
                                index === segment * 7) {
                                // 시간 값 형식 간소화 (예: "오전 10:00:00" -> "오전10:00")
                                const timeLabel = this.getLabelForValue(val);
                                // 시간 형식 간소화
                                const timeParts = timeLabel.split(' ');
                                if (timeParts.length > 1) {
                                    const amPm = timeParts[0]; // 오전/오후
                                    const timeOnly = timeParts[1].split(':');
                                    return `${amPm}${timeOnly[0]}:${timeOnly[1]}`;
                                }
                                return timeLabel;
                            }
                            return '';
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(200, 200, 200, 0.3)',
                        drawBorder: true,
                        drawOnChartArea: true
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: label,
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        font: {
                            size: 12
                        },
                        color: '#666'
                    },
                    grid: {
                        display: true,
                        color: 'rgba(200, 200, 200, 0.3)',
                        drawBorder: true,
                        drawOnChartArea: true
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    titleFont: {
                        size: 13
                    },
                    bodyFont: {
                        size: 13
                    },
                    padding: 10,
                    cornerRadius: 6,
                    displayColors: true, // 색상 표시 활성화
                    callbacks: {
                        label: function(context) {
                            return `${label}: ${context.parsed.y}`;
                        }
                    }
                },
                legend: {
                    labels: {
                        font: {
                            size: 13
                        },
                        boxWidth: 15,
                        padding: 15,
                        usePointStyle: true, // 포인트 스타일 사용
                        pointStyle: 'circle' // 원형 포인트 스타일
                    }
                }
            }
        }
    });
}

// 테이블 업데이트 (페이지네이션)
function updateTable() {
    const tableBody = document.getElementById('recordsBody');
    
    // 'pageInfo' 요소에서 페이지 번호 추출 - null 체크 추가
    const pageInfoElement = document.getElementById('pageInfo');
    let currentPage = 1; // 기본값 설정
    
    if (pageInfoElement) {
        const pageInfoText = pageInfoElement.textContent;
        currentPage = parseInt(pageInfoText.match(/\d+/)[0]) || 1; // "페이지 1"에서 숫자 1 추출
    }
    
    const rowsPerPage = 20; // 한 페이지에 나오는 레코드 수
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;    
    const paginatedData = recordsData.slice(start, end);
    
    let tableHtml = '';
    
    if (paginatedData.length === 0) {
        tableHtml = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px;">
                    데이터가 없습니다.
                </td>
            </tr>
        `;
    } else {
        paginatedData.forEach(record => {
            if (currentDataType === 'air') {
                tableHtml += `
                    <tr>
                        <td>${record.date}</td>
                        <td>${record.time}</td>
                        <td>${record.temperature}</td>
                        <td>${record.humidity}</td>
                        <td>${record.co2}</td>
                    </tr>
                `;
            } else {
                tableHtml += `
                    <tr>
                        <td>${record.date}</td>
                        <td>${record.time}</td>
                        <td>${record.temperature}</td>
                        <td>${record.ph}</td>
                        <td>${record.ec}</td>
                    </tr>
                `;
            }
        });
    }
    
    tableBody.innerHTML = tableHtml;
    
    // 페이지 정보 업데이트 - null 체크 추가
    if (pageInfoElement) {
        pageInfoElement.textContent = `페이지 ${currentPage}`;
    }
    
    // 이전/다음 버튼 활성화/비활성화 - null 체크 추가
    const prevPageBtn = document.getElementById('prevPage');
    if (prevPageBtn) {
        prevPageBtn.classList.toggle('disabled', currentPage === 1);
    }
    
    const nextPageBtn = document.getElementById('nextPage');
    if (nextPageBtn) {
        nextPageBtn.classList.toggle('disabled', end >= recordsData.length);
    }
    
    // prev10Page와 next10Page 요소가 존재하는지 확인 후 속성 설정
    const prev10PageBtn = document.getElementById('prev10Page');
    if (prev10PageBtn) {
        prev10PageBtn.classList.toggle('disabled', currentPage <= 10);
    }
    
    const next10PageBtn = document.getElementById('next10Page');
    if (next10PageBtn) {
        next10PageBtn.classList.toggle('disabled', currentPage + 10 > Math.ceil(recordsData.length / rowsPerPage));
    }
    
    // 페이지 번호 버튼 업데이트
    updatePageButtons(currentPage, Math.ceil(recordsData.length / rowsPerPage));
}

// 페이지 번호 버튼 업데이트 함수
function updatePageButtons(currentPage, totalPages) {
    const pageButtonsContainer = document.getElementById('pageButtons');
    
    if (!pageButtonsContainer) return; // 페이지 버튼 컨테이너가 없으면 함수 종료
    
    // 표시할 페이지 번호 범위 계산
    let startPage = Math.max(1, Math.floor((currentPage - 1) / 10) * 10 + 1);
    let endPage = Math.min(startPage + 9, totalPages);
    
    let buttonsHtml = '';
    
    // 모든 요소를 가로로 일렬로 정렬
    buttonsHtml += `<div class="pagination-row">`;
    
    // 10페이지 이전 버튼
    buttonsHtml += `<a id="prev10Page" class="${currentPage <= 10 ? 'disabled' : ''}">&lt;10페이지</a>`;
    
    // 이전 버튼
    buttonsHtml += `<a id="prevPage" class="${currentPage === 1 ? 'disabled' : ''}">&lt;</a>`;
    
    // 페이지 번호들 - 실제 데이터가 있는 페이지만 표시
    for (let i = startPage; i <= endPage; i++) {
        // 총 페이지 수보다 큰 페이지 번호는 표시하지 않음
        if (i <= totalPages) {
            buttonsHtml += `<a class="pageNumber ${i === currentPage ? 'active' : ''}">${i}</a>`;
        }
    }
    
    // 다음 버튼
    buttonsHtml += `<a id="nextPage" class="${currentPage >= totalPages ? 'disabled' : ''}">&gt;</a>`;
    
    // 10페이지 다음 버튼
    buttonsHtml += `<a id="next10Page" class="${currentPage + 10 > totalPages ? 'disabled' : ''}">10페이지&gt;</a>`;
    
    buttonsHtml += `</div>`;
    
    pageButtonsContainer.innerHTML = buttonsHtml;
    
    // 이벤트 리스너 추가 - 요소가 존재하는지 확인 후 추가
    // 페이지 번호 이벤트 리스너 추가
    document.querySelectorAll('.pageNumber').forEach(link => {
        link.addEventListener('click', function() {
            if (!this.classList.contains('disabled')) {
                const newPage = parseInt(this.textContent);
                document.getElementById('pageInfo').textContent = `페이지 ${newPage}`;
                updateTable();
            }
        });
    });
    
    // 이전/다음 링크 이벤트 리스너 추가
    const prevPageLink = document.getElementById('prevPage');
    if (prevPageLink) {
        prevPageLink.addEventListener('click', function() {
            if (!this.classList.contains('disabled') && currentPage > 1) {
                document.getElementById('pageInfo').textContent = `페이지 ${currentPage - 1}`;
                updateTable();
            }
        });
    }
    
    const nextPageLink = document.getElementById('nextPage');
    if (nextPageLink) {
        nextPageLink.addEventListener('click', function() {
            if (!this.classList.contains('disabled') && currentPage < totalPages) {
                document.getElementById('pageInfo').textContent = `페이지 ${currentPage + 1}`;
                updateTable();
            }
        });
    }
    
    // 10페이지 이전/다음 링크 이벤트 리스너 추가
    const prev10PageLink = document.getElementById('prev10Page');
    if (prev10PageLink) {
        prev10PageLink.addEventListener('click', function() {
            if (!this.classList.contains('disabled') && currentPage > 10) {
                const newPage = Math.max(1, currentPage - 10);
                document.getElementById('pageInfo').textContent = `페이지 ${newPage}`;
                updateTable();
            }
        });
    }
    
    const next10PageLink = document.getElementById('next10Page');
    if (next10PageLink) {
        next10PageLink.addEventListener('click', function() {
            if (!this.classList.contains('disabled') && currentPage + 10 <= totalPages) {
                const newPage = currentPage + 10;
                document.getElementById('pageInfo').textContent = `페이지 ${newPage}`;
                updateTable();
            }
        });
    }
}

// 뷰 전환 처리
document.getElementById('showChart').addEventListener('click', function() {
    document.querySelector('.chart-container').style.display = 'block';
    document.getElementById('tableView').style.display = 'none';
    this.classList.add('active');
    document.getElementById('showTable').classList.remove('active');
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.resize();
        }
    });
});

document.getElementById('showTable').addEventListener('click', function() {
    document.querySelector('.chart-container').style.display = 'none';
    document.getElementById('tableView').style.display = 'block';
    this.classList.add('active');
    document.getElementById('showChart').classList.remove('active');
});

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 페이지 제목 업데이트
    updatePageTitle();
    
    // 데이터 타입에 따라 테이블 헤더 업데이트
    updateTableHeader();
    
    // 차트 컨테이너 표시/숨김 설정
    updateChartVisibility();
    
    // 기본 데이터 로드
    loadData();
});