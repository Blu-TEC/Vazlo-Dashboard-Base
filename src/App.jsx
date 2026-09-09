import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, AreaChart, Area
} from 'recharts';
import data from './data.json';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [historialAlertas, setHistorialAlertas] = useState([]);
  const [alertaHoy, setAlertaHoy] = useState("🤖 Conectando con Gemini API...");
  const [cargandoIA, setCargandoIA] = useState(true);

  useEffect(() => {
    async function generarAnalisisRealConIA() {
      try {
        // Identificador del "estado actual" de los datos: el último día registrado.
        // Si este valor no cambia respecto a la última corrida, usamos la caché
        // y no volvemos a llamar a la API (ahorra cuota y evita el error de "alta demanda").
        const ultimoDato = data.telemetriaSemanal[data.telemetriaSemanal.length - 1].dia;
        const cacheKey = 'sitmi_analisis_ia';
        const cacheRaw = localStorage.getItem(cacheKey);

        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (cache.ultimoDato === ultimoDato) {
            setAlertaHoy(cache.alertaHoy);
            setHistorialAlertas(cache.historial);
            setCargandoIA(false);
            return;
          }
        }

        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          setAlertaHoy("Error: No se encontró la llave en el archivo .env");
          setCargandoIA(false);
          return;
        }

        // Prompt alineado al piloto real de SITMI (Fase 3, 4 y 5, y modelo financiero):
        // - El piloto instrumentado con acelerómetros de 3 ejes cubre exactamente 3 máquinas
        //   (torno, prensa, celda de soldadura), no el horno de vulcanización.
        // - El horno tiene su propia telemetría térmica (termopares + sistema ORC), ya cubierta
        //   por separado en "telemetriaSemanal" (tempHornos).
        // - El KPI oficial de "Anticipación de Fallas" (Fase 4) exige 3 o más semanas de antelación.
        // - No se le pasan incidencias ya redactadas: la IA debe detectarlas analizando los datos crudos.
        const prompt = `
          Actúa como el motor predictivo de mantenimiento del sistema SITMI de la planta VAZLO.
          No recibirás eventos ni incidencias ya identificadas: debes DETECTARLAS TÚ analizando
          las series de tiempo crudas que te doy a continuación.

          1. Telemetría eléctrica/térmica semanal (Ene-Sep 2026), incluye factor de potencia,
             corriente consumida y temperatura recuperada por el sistema ORC de los hornos de
             vulcanización: ${JSON.stringify(data.telemetriaSemanal)}

          2. Histórico mensual de vibración (mm/s, ejes X/Y/Z) de las 3 máquinas del piloto
             instrumentado con acelerómetros (torno CNC, prensa de estampado y celda de
             soldadura; el horno de vulcanización NO tiene acelerómetros, su telemetría es
             térmica y ya está incluida en el punto 1): ${JSON.stringify(data.vibracionHistorica)}

          3. Snapshot actual de vibración por máquina: ${JSON.stringify(data.vibracionMaquinaria)}

          Reglas de referencia (documentadas en el proyecto SITMI):
          - Factor de potencia meta: >= 0.95 de forma constante. Una caída de 0.02 o más respecto
            a la semana anterior, o un valor por debajo de 0.90 después de que ya había mejorado,
            cuenta como incidencia de calidad eléctrica.
          - Vibración: <4.5 mm/s normal, 4.5-7 mm/s alerta temprana, >7 mm/s riesgo de falla
            inminente. Una tendencia sostenida al alza durante 3 o más meses en el histórico
            también es señal de alerta, aunque el valor absoluto aún no cruce el umbral.
          - El KPI de "Anticipación de Fallas" del proyecto exige predecir con 3 SEMANAS O MÁS
            de antelación. Nunca prometas una ventana menor a 3 semanas en tus predicciones.

          Tu trabajo:
          1. Recorre "telemetriaSemanal" y encuentra los periodos donde el factor de potencia o
             la temperatura del ORC caen de forma anómala respecto a la tendencia general de
             mejora. Identifica la fecha aproximada de cada caída.
          2. Recorre "vibracionHistorica" y encuentra qué máquina(s), de entre las 3 del piloto,
             muestran tendencia de desgaste sostenido (valores subiendo mes a mes), no solo el
             valor más alto del momento actual.
          3. Con eso, redacta alertas de mantenimiento predictivo como lo haría un técnico: qué
             pasó o está pasando, en qué máquina o sistema, y una predicción de cuándo podría
             fallar (mínimo 3 semanas de antelación) o qué acción tomar. No inventes fechas,
             máquinas o sensores que no existan en los datos o que no correspondan al piloto real
             (recuerda: el horno de vulcanización no tiene sensor de vibración).

          Devuelve ESTRICTAMENTE un objeto JSON válido. NO uses bloques de código (ni \`\`\`json),
          SOLO el texto del JSON con este formato:
          {
            "alertaHoy": "Reporte de mantenimiento predictivo de 2 líneas sobre el estado actual (09 Sep), basado en tu análisis de la tendencia más reciente de vibración y del factor de potencia.",
            "historial": [
              "Alerta de mantenimiento predictivo detectada en los datos, con fecha aproximada, máquina/sistema, sensor y ventana de tiempo estimada (3+ semanas)",
              "Otra alerta detectada",
              "Otra alerta detectada",
              "Otra alerta detectada",
              "Otra alerta detectada"
            ]
          }
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error?.message || "Error desconocido en la conexión HTTP");
        }

        let textoRespuesta = result.candidates[0].content.parts[0].text;

        // Limpiamos la respuesta por si la IA añade formato Markdown
        textoRespuesta = textoRespuesta.replace(/```json/gi, '').replace(/```/g, '').trim();

        const analisisIA = JSON.parse(textoRespuesta);
        const historialFinal = analisisIA.historial.reverse();

        setAlertaHoy(analisisIA.alertaHoy);
        setHistorialAlertas(historialFinal);
        setCargandoIA(false);

        // Guardamos en caché para no volver a llamar a la API si los datos no cambian
        localStorage.setItem(cacheKey, JSON.stringify({
          ultimoDato,
          alertaHoy: analisisIA.alertaHoy,
          historial: historialFinal
        }));

      } catch (error) {
        console.error("Detalle técnico del error:", error);
        setAlertaHoy(`Error de red/API: ${error.message}`);
        setCargandoIA(false);
      }
    }

    generarAnalisisRealConIA();
  }, []);

  return (
    <div className="app-layout">
      {/* Sidebar de Navegación */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>SITMI</h2>
          <p>VAZLO Industry (2026)</p>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`} 
            onClick={() => setActiveTab('home')}
          >
            📊 Home (Dashboard)
          </button>
          <button 
            className={`nav-btn ${activeTab === 'alertas' ? 'active' : ''}`} 
            onClick={() => setActiveTab('alertas')}
          >
            🚨 Historial de Alertas {cargandoIA ? "(...)" : `(${historialAlertas.length})`}
          </button>
        </nav>
      </aside>

      {/* Contenido Principal */}
      <main className="main-content">
        {activeTab === 'home' ? (
          <div className="dashboard-container">
            <header className="header">
              <h1>Panel de Control en Tiempo Real (2026)</h1>
              <p>Sistema de Integración Térmica y Monitoreo Inteligente (SaaS)</p>
            </header>

            {/* Tarjetas de Resumen (KPIs) */}
            <div className="kpi-grid">
              <div className="kpi-card alert-card">
                <h3>Factor de Potencia</h3>
                <p className="kpi-value">{data.kpis.factorPotenciaPromedio}</p>
                <span className="kpi-subtitle">Meta: &ge; 0.95 (CFE)</span>
              </div>
              <div className="kpi-card thermal-card">
                <h3>Temp. ORC Recuperada</h3>
                <p className="kpi-value">{data.kpis.temperaturaRecuperada}</p>
                <span className="kpi-subtitle">Hornos de vulcanización</span>
              </div>
              <div className="kpi-card savings-card">
                <h3>Ahorro Anual Est.</h3>
                <p className="kpi-value">{data.kpis.ahorroAnualProyectado}</p>
                <span className="kpi-subtitle">Mitigación de multas y energía</span>
              </div>
            </div>

            {/* Sección de Gráficas en Cuadrícula 2x2 */}
            <div className="charts-grid">
              <div className="chart-card">
                <h2>Estabilidad del Factor de Potencia (2026)</h2>
                <div style={{ width: '100%', height: 210 }}>
                  <ResponsiveContainer>
                    <AreaChart data={data.telemetriaSemanal}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dia" />
                      <YAxis domain={[0.75, 1.0]} ticks={[0.75, 0.80, 0.85, 0.90, 0.95, 1.0]} />
                      <Tooltip />
                      <ReferenceLine y={0.95} stroke="#ef4444" strokeDasharray="3 3" label="Límite (0.95)" />
                      <Area type="monotone" dataKey="factorPotencia" stroke="#10b981" fill="#a7f3d0" name="F.P." />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h2>Consumo de Corriente</h2>
                <div style={{ width: '100%', height: 210 }}>
                  <ResponsiveContainer>
                    <LineChart data={data.telemetriaSemanal}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dia" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="corrienteA" stroke="#6366f1" strokeWidth={3} name="Amperes" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h2>Estrés Mecánico (Vibración) — Piloto instrumentado</h2>
                <div style={{ width: '100%', height: 210 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.vibracionMaquinaria}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="maquina" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="ejeX" fill="#3b82f6" name="X" />
                      <Bar dataKey="ejeY" fill="#f59e0b" name="Y" />
                      <Bar dataKey="ejeZ" fill="#ef4444" name="Z" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h2>Recuperación Térmica (ORC) — Horno de vulcanización</h2>
                <div style={{ width: '100%', height: 210 }}>
                  <ResponsiveContainer>
                    <AreaChart data={data.telemetriaSemanal}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dia" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="tempHornos" stroke="#f97316" fill="#fdba74" name="Temp" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Alerta Evaluada por IA */}
              <div className="chart-card ai-card full-width">
                <h2>🤖 Análisis del Día Actual (Generado por IA)</h2>
                <p className="ai-text">{alertaHoy}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard-container">
            <header className="header">
              <h1>Historial de Alertas e Incidencias</h1>
              <p>Evaluación retrospectiva redactada por el motor predictivo de Gemini</p>
            </header>
            
            <div className="alertas-history-container">
              {cargandoIA ? (
                <p className="no-alerts">Gemini está analizando los meses de telemetría de la planta...</p>
              ) : (
                historialAlertas.map((alerta, index) => (
                  <div key={index} className="history-alert-card">
                    <span className="alert-badge">Evaluación IA #{historialAlertas.length - index}</span>
                    <p>{alerta}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
//localStorage.removeItem('sitmi_analisis_ia');