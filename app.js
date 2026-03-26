// === SISTEMA RH NAVOJOA v88.0 ===
// NUEVO: Módulo Correspondencia de Nómina protegido por usuario/contraseña

let db, storage, empleadoActual = null, fileCache = {}, debounceTimer;
let unsubscribeEmpleado = null, unsubscribeMovimientos = null;

const DIAS_FESTIVOS = ["01-01", "02-02", "02-24", "03-16", "04-02", "04-03", "05-01", "05-05", "07-17", "09-15", "09-16", "11-02", "11-16", "12-12", "12-25"];

// === FIREBASE CONFIG ===
const firebaseConfig = {
    apiKey: "AIzaSyD0rc64cfBhBsNtJCMyDCNbc5qXv5wNlVU",
    authDomain: "nuevo-proyecto-92479.firebaseapp.com",
    projectId: "nuevo-proyecto-92479",
    storageBucket: "media-nuevo-proyecto-92479-2ecf",
    messagingSenderId: "798385147161",
    appId: "1:798385147161:web:bb909d1e4c95708c2b8988"
};

// === UTILIDADES ===
function safeText(id, val) { const el = document.getElementById(id); if (el) el.innerText = val || "-"; }
function safeVal(id, val) { const el = document.getElementById(id); if (el) el.value = val || ""; }
function mostrarLoader(show, msg = "Procesando...") {
    const l = document.getElementById('loader');
    if (l) { l.style.display = show ? 'flex' : 'none'; l.querySelector('.mt-2').innerText = msg; }
}
function validarSesion() { if (!empleadoActual) { Swal.fire("Error", "Busca un empleado primero", "warning"); return false; } return true; }
function triggerFile(sufijo) { document.getElementById('file' + sufijo).click(); }

function fileSelected(sufijo) {
    const input = document.getElementById('file' + sufijo);
    if (input.files[0]) {
        fileCache[sufijo] = input.files[0];
        const btn = document.getElementById('btnScan' + sufijo);
        if (btn) { btn.classList.add('archivo-cargado'); const span = btn.querySelector('span'); if (span) span.innerText = input.files[0].name.substring(0, 15); }
    }
}

function resetForm(sufijo) {
    if (document.getElementById('txtNumOficio' + sufijo)) document.getElementById('txtNumOficio' + sufijo).value = "";
    if (document.getElementById('txtDias' + sufijo)) document.getElementById('txtDias' + sufijo).value = "";
    const btn = document.getElementById('btnScan' + sufijo);
    if (btn) {
        btn.classList.remove('archivo-cargado');
        const span = btn.querySelector('span');
        let texto = "Adjuntar Oficio";
        if (sufijo === 'Alta') texto = "Seleccionar Archivo";
        else if (sufijo === 'Baja') texto = "Adjuntar Renuncia/Acta";
        else if (sufijo === 'Incap') texto = "Adjuntar Incap.";
        else if (sufijo === 'Permiso') texto = "Adjuntar Justif.";
        else if (sufijo === 'Edit') texto = "Subir Nuevo Archivo";
        else if (sufijo === 'Extra') texto = "Escanear";
        else if (sufijo === 'Varios') texto = "Adjuntar Archivo";
        else if (sufijo === 'Corr') texto = "Adjuntar Archivo";
        if (span) span.innerText = texto;
    }
    delete fileCache[sufijo];
}

function calcFechas(sufijo, type) {
    const diasIn = document.getElementById('txtDias' + sufijo);
    const fechaIn = document.getElementById('txtFecha' + sufijo);
    if (!diasIn || !fechaIn) return;
    const dias = parseInt(diasIn.value);
    const inicio = fechaIn.value;
    if (dias && inicio) {
        const d = new Date(inicio);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        if (type === 'N') { d.setDate(d.getDate() + (dias - 1)); }
        else {
            let diasRestantes = dias - 1;
            while (diasRestantes > 0) {
                d.setDate(d.getDate() + 1);
                const mes = (d.getMonth() + 1).toString().padStart(2, '0');
                const dia = d.getDate().toString().padStart(2, '0');
                const fechaMMDD = `${mes}-${dia}`;
                const esFinDeSemana = (d.getDay() === 0 || d.getDay() === 6);
                const esFestivo = DIAS_FESTIVOS.includes(fechaMMDD);
                if (!esFinDeSemana && !esFestivo) diasRestantes--;
            }
        }
        document.getElementById('txtFechaFin' + sufijo).value = d.toISOString().split('T')[0];
    }
}

function calcularTurnos() {
    const horas = parseFloat(document.getElementById('txtHorasLaboradas').value) || 0;
    let turnos = Math.round((horas / 4) * 2) / 2;
    document.getElementById('txtDiasExtra').value = turnos.toFixed(1);
}

// === INICIALIZACIÓN ===
function initApp() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
    console.log("Firebase OK - v87 Corregido");
    mostrarLoader(false);
}

// === STORAGE ===
async function subirArchivoStorage(file, path) {
    if (file.size > 20 * 1024 * 1024) throw new Error("Archivo excede 20MB.");
    const ref = storage.ref().child(path);
    const uploadTask = ref.put(file);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 45s")), 45000));
    await Promise.race([uploadTask, timeoutPromise]);
    return await ref.getDownloadURL();
}

// === BUSCADOR ===
function buscarPredictivo() {
    clearTimeout(debounceTimer);
    const texto = document.getElementById('txtBuscarID').value.trim().toUpperCase();
    const datalist = document.getElementById('listaSugerencias');
    if (texto.length < 1) { datalist.innerHTML = ""; return; }
    debounceTimer = setTimeout(() => {
        datalist.innerHTML = "";
        db.collection("empleados").where("nombre", ">=", texto).where("nombre", "<=", texto + "\uf8ff").limit(5).get()
            .then(sn => sn.forEach(doc => { const opt = document.createElement('option'); opt.value = `${doc.data().id} - ${doc.data().nombre}`; datalist.appendChild(opt); }));
        db.collection("empleados").where("id", ">=", texto).where("id", "<=", texto + "\uf8ff").limit(5).get()
            .then(sn => sn.forEach(doc => { const opt = document.createElement('option'); opt.value = `${doc.data().id} - ${doc.data().nombre}`; datalist.appendChild(opt); }));
    }, 300);
}

function seleccionarSugerencia() {
    let val = document.getElementById('txtBuscarID').value;
    if (val.includes(" - ")) document.getElementById('txtBuscarID').value = val.split(" - ")[0];
    buscarEmpleado();
}

function buscarEmpleado() {
    const busqueda = document.getElementById('txtBuscarID').value.trim().toUpperCase();
    if (!busqueda) return;
    mostrarLoader(true, "Buscando...");
    if (unsubscribeEmpleado) unsubscribeEmpleado();
    if (unsubscribeMovimientos) unsubscribeMovimientos();
    db.collection("empleados").doc(busqueda).get().then(doc => {
        if (doc.exists) { iniciarListeners(doc.id); }
        else { mostrarLoader(false); Swal.fire("No encontrado", "Verifique el ID", "error"); }
    });
}

function iniciarListeners(docId) {
    unsubscribeEmpleado = db.collection("empleados").doc(docId).onSnapshot(doc => {
        empleadoActual = doc.data();
        empleadoActual.docId = doc.id;
        renderizarEmpleado();
        mostrarLoader(false);
    });
    unsubscribeMovimientos = db.collection("movimientos").where("empleadoId", "==", docId).onSnapshot(qs => {
        let movs = [];
        qs.forEach(doc => { let d = doc.data(); d.docId = doc.id; movs.push(d); });
        movs.sort((a, b) => (b.fechaInicio || "").localeCompare(a.fechaInicio || ""));
        if (empleadoActual) { empleadoActual.movimientos = movs; renderizarEmpleado(); }
        cargarHistorial(movs);
    });
}

// === RENDERIZADO ===
function renderizarEmpleado() {
    const e = empleadoActual;
    if (!e) return;
    safeText('lblNombre', e.nombre);
    safeText('lblID', "ID: " + e.id);
    safeText('lblArchivoFisico', "ARCH: " + (e.numArchivo || "N/A"));

    const containerContrato = document.getElementById('btnVerContratoContainer');
    if (e.contratoUrl) {
        containerContrato.innerHTML = `<a href="${e.contratoUrl}" target="_blank" class="btn btn-sm btn-outline-danger fw-bold w-100"><i class="bi bi-file-earmark-pdf-fill"></i> VER CONTRATO</a>`;
    } else { containerContrato.innerHTML = '<small class="text-muted">Sin contrato digital</small>'; }

    safeText('txtDepto', e.depto); safeText('txtPuesto', e.puesto); safeText('txtAlta', e.fechaAlta);
    safeText('txtAntiguedad', "-"); safeText('txtEmpresa', e.empresa); safeText('txtTipo', e.tipo);
    safeText('txtCurp', e.curp); safeText('txtTel', e.tel); safeText('txtDireccion', e.direccion);
    safeText('txtSeguro', e.seguro); safeText('txtPoliza', e.poliza);
    safeText('txtBanco', e.banco); safeText('txtCuenta', e.cuenta); safeText('txtClabe', e.clabe);

    const infoVac = calcularSaldoVacacionesReales(e);
    safeText('lblSaldoVac', infoVac.saldo);
    safeText('lblDerechoVac', `Der: ${infoVac.derecho} /sem`);
    safeText('lblSaldoEcon', e.saldoEcon || 0);
    safeText('lblSaldoPSG', (e.saldoPSG || 0) + " / 45");
    safeText('lblSaldoIncap', e.saldoIncap || 0);
    // Calcular contadores desde movimientos del año actual
    let comisionesAnual = 0, faltasAnual = 0, retardosAnual = 0, lutoAnual = 0;
    if (e.movimientos) {
        const anioActual = new Date().getFullYear().toString();
        e.movimientos.forEach(m => {
            if (m.fechaInicio && m.fechaInicio.startsWith(anioActual)) {
                if (m.tipo === 'COMISION') comisionesAnual += parseFloat(m.dias || 0);
                if (m.tipo === 'JUSTIFICANTE_FALTA') faltasAnual += parseFloat(m.dias || 0);
                if (m.tipo === 'JUSTIFICANTE_RETARDO') retardosAnual += parseFloat(m.dias || 0);
                if (m.tipo === 'PCG_LUTO') lutoAnual += parseFloat(m.dias || 0);
            }
        });
    }
    safeText('lblAcumLuto', lutoAnual);
    safeText('lblAcumComisiones', comisionesAnual);
    safeText('lblAcumFaltas', faltasAnual);
    safeText('lblAcumRetardos', retardosAnual);
    // Mostrar fechas de pago de Prima Vacacional
    safeText('lblPrima1erSem', e.prima1erSem || "-");
    safeText('lblPrima2doSem', e.prima2doSem || "-");

    safeVal('editID', e.id); safeVal('editNombre', e.nombre); safeVal('editFechaAlta', e.fechaAlta);
    safeVal('editDepto', e.depto); safeVal('editPuesto', e.puesto); safeVal('editEmpresa', e.empresa);
    safeVal('editTipo', e.tipo); safeVal('editNombramiento', e.oficioAlta); safeVal('editArchivo', e.numArchivo);
    safeVal('editDireccion', e.direccion); safeVal('editTel', e.tel); safeVal('editCurp', e.curp);
    safeVal('editSeguro', e.seguro); safeVal('editPoliza', e.poliza);
    safeVal('editBanco', e.banco); safeVal('editCuenta', e.cuenta); safeVal('editClabe', e.clabe);

    if (e.fechaAlta) {
        const hoy = new Date();
        let fa = e.fechaAlta;
        if (fa && fa.toDate) fa = fa.toDate(); else fa = new Date(fa);
        if (!isNaN(fa.getTime())) {
            const anti = Math.abs(hoy - fa) / (1000 * 60 * 60 * 24 * 365.25);
            safeText('txtAntiguedad', anti.toFixed(1) + " Años");
        }
    }

    const st = determinarEstatus(e);
    const badge = document.getElementById('lblStatusDinamico');
    if (badge) { badge.innerText = st.texto; badge.className = "badge-base " + st.clase; }

    const contIncap = document.getElementById('contenedorIncapacidad');
    const lblIncap = document.getElementById('lblIncapFase');
    if (e.estatus_incapacidad) {
        if(contIncap) contIncap.classList.remove('d-none');
        if(lblIncap) lblIncap.innerText = `PAGO AL ${e.porcentaje_pago_actual || 0}%`;
    } else {
        if(contIncap) contIncap.classList.add('d-none');
    }
}

function calcularSaldoVacacionesReales(empleado) {
    if (!empleado.fechaAlta) return { derecho: 0, usados: 0, saldo: 0, periodo: "N/A" };
    const hoy = new Date();
    let alta;
    if (empleado.fechaAlta && empleado.fechaAlta.toDate) alta = empleado.fechaAlta.toDate();
    else if (typeof empleado.fechaAlta === 'string') { const parts = empleado.fechaAlta.split('-'); alta = new Date(parts[0], parts[1] - 1, parts[2]); }
    else alta = new Date(empleado.fechaAlta);
    if (isNaN(alta.getTime())) return { derecho: 0, usados: 0, saldo: 0, periodo: "Error Fecha" };

    let mesesAntiguedad = (hoy.getFullYear() - alta.getFullYear()) * 12 - alta.getMonth() + hoy.getMonth();
    if (hoy.getDate() < alta.getDate()) mesesAntiguedad--;
    if (mesesAntiguedad < 6) return { derecho: 0, usados: 0, saldo: 0, periodo: "< 6 meses" };

    const aniosCumplidos = mesesAntiguedad / 12;
    const quinquenios = Math.floor(aniosCumplidos / 5);
    const derechoSemestral = 10 + quinquenios;

    const currentYear = hoy.getFullYear();
    let inicioPeriodo, finPeriodo, nombrePeriodo;
    if (hoy.getMonth() < 6) { inicioPeriodo = new Date(currentYear, 0, 1); finPeriodo = new Date(currentYear, 5, 30); nombrePeriodo = `1º Sem ${currentYear}`; }
    else { inicioPeriodo = new Date(currentYear, 6, 1); finPeriodo = new Date(currentYear, 11, 31); nombrePeriodo = `2º Sem ${currentYear}`; }

    let diasGastados = 0;
    if (empleado.movimientos) {
        empleado.movimientos.forEach(mov => {
            if (mov.tipo === 'VACACIONES') {
                let fechaMov;
                if (mov.fechaInicio && typeof mov.fechaInicio === 'string') { const fParts = mov.fechaInicio.split('-'); fechaMov = new Date(fParts[0], fParts[1] - 1, fParts[2]); }
                else fechaMov = new Date(mov.fechaInicio);
                if (fechaMov >= inicioPeriodo && fechaMov <= finPeriodo) diasGastados += parseFloat(mov.dias || 0);
            }
        });
    }
    return { derecho: derechoSemestral, usados: diasGastados, saldo: Math.max(0, derechoSemestral - diasGastados), periodo: nombrePeriodo };
}

function cargarHistorial(movs) {
    const tbody = document.getElementById('tablaHistorial');
    if (!tbody) return;
    tbody.innerHTML = "";
    if (movs) {
        const recientes = [...movs].reverse().slice(0, 10);
        recientes.forEach(d => {
            let link = '-';
            if (d.urlEvidencia) {
                if (d.urlEvidencia.startsWith('http')) link = `<button class="btn btn-sm btn-link" onclick="window.open('${d.urlEvidencia}', '_blank')"><i class="bi bi-eye"></i></button>`;
                else link = `<button class="btn btn-sm btn-link" onclick="abrirBase64('${d.docId}')"><i class="bi bi-eye"></i></button>`;
            }
            tbody.innerHTML += `<tr><td>${d.fechaInicio}</td><td>${d.tipo}</td><td>${d.dias}</td><td>${d.oficio}</td><td>${link}</td></tr>`;
        });
    }
}

window.abrirBase64 = function (docId) {
    if (!empleadoActual || !empleadoActual.movimientos) return;
    const m = empleadoActual.movimientos.find(x => x.docId === docId);
    if (m && m.urlEvidencia) { const win = window.open(); win.document.write('<iframe src="' + m.urlEvidencia + '" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>'); }
};

function determinarEstatus(e) {
    if (e.estatus_incapacidad) return { texto: 'INCAPACITADO (' + (e.porcentaje_pago_actual || 0) + '%)', clase: 'estatus-incapacidad' };
    
    // Check for "INCAPACITADO" as a string status just in case
    const estatusFijos = ['BAJA', 'JUBILADO', 'PENSIONADO', 'SUSPENDIDO', 'INCAPACITADO'];
    if (estatusFijos.some(s => e.estatus && e.estatus.includes(s))) return { texto: e.estatus, clase: 'estatus-' + e.estatus.split(' ')[0].toLowerCase() };
    const now = new Date();
    const hoy = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    if (e.movimientos && e.movimientos.length > 0) {
        const mov = e.movimientos.find(m => hoy >= m.fechaInicio && hoy <= m.fechaFin);
        if (mov) {
            if (mov.tipo === 'VACACIONES') return { texto: 'DE VACACIONES', clase: 'estatus-vacaciones' };
            if (mov.tipo === 'INCAPACIDAD') return { texto: 'INCAPACITADO (TEMPORAL)', clase: 'estatus-incapacidad' };
            if (mov.tipo.includes('PERMISO')) return { texto: 'CON PERMISO', clase: 'estatus-permiso' };
            if (mov.tipo === 'COMISION') return { texto: 'EN COMISIÓN', clase: 'estatus-comision' };
        }
    }
    return { texto: 'ACTIVO', clase: 'estatus-activo' };
}

// === GUARDAR VACACIONES ===
async function guardarVacaciones() {
    if (!validarSesion()) return;
    const dias = parseFloat(document.getElementById('txtDiasVac').value) || 0;
    const accion = document.getElementById('cmbTipoVac').value;
    const infoVac = calcularSaldoVacacionesReales(empleadoActual);
    if (dias > infoVac.saldo && accion !== 'CANCELACION') {
        Swal.fire("Saldo Insuficiente", `Solo tienes ${infoVac.saldo} días disponibles.`, "error");
        return;
    }
    await guardarMovGenerico("VACACIONES", "Vac", dias);
}

// === GUARDAR INCAPACIDAD (ARTÍCULO 100 ACTIVO) ===
async function guardarIncapacidad() {
    if (!validarSesion()) return;
    const dias = parseFloat(document.getElementById('txtDiasIncap').value) || 0;
    const tipo = document.getElementById('cmbTipoIncap').value;

    // Calcular antigüedad
    let antiguedad = 0;
    if (empleadoActual.fechaAlta) {
        let fa = empleadoActual.fechaAlta;
        if (fa && fa.toDate) fa = fa.toDate(); else fa = new Date(fa);
        if (!isNaN(fa.getTime())) antiguedad = Math.abs(new Date() - fa) / (1000 * 60 * 60 * 24 * 365.25);
    }

    // Límites según Artículo 100
    let limite = 15;
    if (antiguedad >= 1 && antiguedad < 5) limite = 30;
    else if (antiguedad >= 5 && antiguedad < 10) limite = 45;
    else if (antiguedad >= 10) limite = 60;

    if (tipo === "ENFERMEDAD GENERAL") {
        const acumulado = (empleadoActual.saldoIncap || 0);
        const nuevoTotal = acumulado + dias;
        if (nuevoTotal > limite) {
            const msg = `<b>Antigüedad:</b> ${antiguedad.toFixed(1)} años<br><b>Límite 100%:</b> ${limite} días<br><b>Acumulado:</b> ${acumulado}<br><b>Nuevo total:</b> ${nuevoTotal}<br><br>Se reajustará el porcentaje de pago de acuerdo al Artículo 100. ¿Registrar?`;
            const result = await Swal.fire({ icon: 'warning', title: '¡PAGO AL 50% O SUBSIDIO!', html: msg, showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, registrar' });
            if (!result.isConfirmed) return;
        }
    }

    // Calcular porcentaje de pago
    let porcentaje = 100;
    if (tipo === "ENFERMEDAD GENERAL") {
        const acumulado = (empleadoActual.saldoIncap || 0) + dias;
        if (acumulado > limite) {
            const limiteFase2 = limite * 2;
            if (acumulado > limiteFase2) {
                porcentaje = 0; // Subsidio
            } else {
                porcentaje = 50;
            }
        }
    }

    const currentYear = new Date().getFullYear();
    const updateObj = {
        saldoIncap: (empleadoActual.saldoIncap || 0) + dias,
        estatus_incapacidad: true,
        tipo_incapacidad: tipo,
        fecha_inicio_incapacidad: document.getElementById('txtFechaIncap').value,
        dias_incapacidad_acumulados_anio: currentYear,
        porcentaje_pago_actual: porcentaje
    };

    await guardarMovGenerico("INCAPACIDAD", "Incap", dias, updateObj);
}

// === GUARDAR PERMISO (REGLAS SINDICALES ACTIVAS) ===
async function guardarPermiso() {
    if (!validarSesion()) return;
    const tipo = document.getElementById('cmbTipoPermiso').value;
    const dias = parseFloat(document.getElementById('txtDiasPermiso').value) || 0;

    // PCG solo para sindicalizados
    if (tipo.includes('PCG') && empleadoActual.tipo !== 'SINDICALIZADO') {
        Swal.fire('Denegado', 'Permisos con Goce (PCG) exclusivos para SINDICALIZADOS.', 'error');
        return;
    }

    // Validar PSG (máx 45 días)
    if (tipo === 'PSG' && (empleadoActual.saldoPSG || 0) + dias > 45) {
        const r = await Swal.fire({ icon: 'warning', title: 'Límite PSG Excedido', text: `Acumulado: ${empleadoActual.saldoPSG || 0} + ${dias} > 45. ¿Continuar?`, showCancelButton: true });
        if (!r.isConfirmed) return;
    }

    // Validar días económicos
    if (tipo === 'PCG_ECONOMICO' && dias > (empleadoActual.saldoEcon || 0)) {
        Swal.fire('Saldo Insuficiente', `Solo restan ${empleadoActual.saldoEcon || 0} días económicos.`, 'error');
        return;
    }

    let upd = {};
    if (tipo === 'PCG_ECONOMICO') upd.saldoEcon = (empleadoActual.saldoEcon || 0) - dias;
    if (tipo === 'PSG') upd.saldoPSG = (empleadoActual.saldoPSG || 0) + dias;
    if (tipo === 'COMISION') upd.acumuladoComisiones = (empleadoActual.acumuladoComisiones || 0) + dias;
    if (tipo === 'JUSTIFICANTE_FALTA') upd.acumuladoFaltas = (empleadoActual.acumuladoFaltas || 0) + dias;
    if (tipo === 'JUSTIFICANTE_RETARDO') upd.acumuladoRetardos = (empleadoActual.acumuladoRetardos || 0) + dias;
    if (tipo === 'PCG_LUTO') upd.acumuladoLuto = (empleadoActual.acumuladoLuto || 0) + dias;
    await guardarMovGenerico(tipo, "Permiso", dias, upd);
}

// === GUARDAR HORAS EXTRA ===
async function guardarHorasExtra() {
    if (!validarSesion()) return;
    const dias = parseFloat(document.getElementById('txtDiasExtra').value) || 0;
    if (!dias) { Swal.fire("Calcula las horas primero", "", "warning"); return; }
    const oficio = document.getElementById('txtNumOficioExtra').value;
    const file = fileCache['Extra'];
    if (!file || !oficio) { Swal.fire("Faltan Datos", "Oficio y archivo obligatorios", "warning"); return; }

    mostrarLoader(true, "Subiendo...");
    try {
        const url = await subirArchivoStorage(file, `evidencias/${empleadoActual.id}/${Date.now()}_${file.name}`);
        const fechaHoy = new Date().toISOString().split('T')[0];
        await db.collection("movimientos").add({
            empleadoId: empleadoActual.id, nombreEmpleado: empleadoActual.nombre,
            tipo: "HORAS_EXTRA", dias: dias, oficio: oficio,
            fechaInicio: fechaHoy, fechaFin: fechaHoy,
            motivo: document.getElementById('txtHorasLaboradas').value + " Horas laboradas",
            urlEvidencia: url, fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
        });
        mostrarLoader(false);
        Swal.fire("Éxito", "", "success");
        resetForm('Extra');
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === GUARDAR PRIMA VACACIONAL ===
async function guardarPrimaVacacional() {
    if (!validarSesion()) return;
    const fecha = document.getElementById('txtFechaPrima').value;
    if (!fecha) { Swal.fire("Error", "Selecciona una fecha de solicitud", "warning"); return; }
    const observaciones = document.getElementById('txtObservacionesPrima').value || "";

    mostrarLoader(true, "Registrando solicitud...");
    try {
        await db.collection("movimientos").add({
            empleadoId: empleadoActual.id,
            nombreEmpleado: empleadoActual.nombre,
            tipo: "PRIMA_VACACIONAL",
            dias: 0,
            oficio: "SOLICITUD PRIMA",
            fechaInicio: fecha,
            fechaFin: fecha,
            motivo: observaciones,
            urlEvidencia: "",
            fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
        });
        mostrarLoader(false);
        Swal.fire("Éxito", "Solicitud de Prima Vacacional registrada", "success");
        document.getElementById('txtFechaPrima').value = "";
        document.getElementById('txtObservacionesPrima').value = "";
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === GUARDAR INCIDENCIAS VARIOS ===
async function guardarIncidenciasVarios() {
    if (!validarSesion()) return;
    const asunto = document.getElementById('txtAsuntoVarios').value.trim();
    const file = fileCache['Varios'];
    if (!asunto) { Swal.fire("Error", "Escriba el asunto", "warning"); return; }
    if (!file) { Swal.fire("Error", "Adjunte un archivo", "warning"); return; }

    mostrarLoader(true, "Subiendo...");
    try {
        const url = await subirArchivoStorage(file, `evidencias/${empleadoActual.id}/${Date.now()}_VARIOS_${file.name}`);
        const fechaHoy = new Date().toISOString().split('T')[0];
        await db.collection("movimientos").add({
            empleadoId: empleadoActual.id,
            nombreEmpleado: empleadoActual.nombre,
            tipo: "INCIDENCIAS_VARIOS",
            dias: 0,
            oficio: asunto,
            fechaInicio: fechaHoy,
            fechaFin: fechaHoy,
            motivo: asunto,
            urlEvidencia: url,
            fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
        });
        mostrarLoader(false);
        Swal.fire("Éxito", "Incidencia registrada correctamente", "success");
        document.getElementById('txtAsuntoVarios').value = "";
        resetForm('Varios');
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === REGISTRAR PAGO DE PRIMA (DESDE NÓMINA) ===
async function registrarPagoPrima() {
    if (!validarSesion()) return;
    const semestre = document.getElementById('cmbSemestrePrimaPago').value;
    const fechaPago = document.getElementById('txtFechaPagoPrima').value;
    if (!fechaPago) { Swal.fire("Error", "Selecciona la fecha de pago", "warning"); return; }

    const campo = semestre === "1" ? "prima1erSem" : "prima2doSem";
    const nombreSem = semestre === "1" ? "1er Semestre" : "2do Semestre";

    mostrarLoader(true, "Registrando pago...");
    try {
        // Guardar en el documento del empleado
        await db.collection("empleados").doc(empleadoActual.docId).update({
            [campo]: fechaPago
        });
        // También registrar como movimiento para historial
        await db.collection("movimientos").add({
            empleadoId: empleadoActual.id,
            nombreEmpleado: empleadoActual.nombre,
            tipo: "PAGO_PRIMA_" + semestre + "SEM",
            dias: 0,
            oficio: "PAGO PRIMA " + nombreSem,
            fechaInicio: fechaPago,
            fechaFin: fechaPago,
            motivo: "Pago de Prima Vacacional - " + nombreSem,
            urlEvidencia: "",
            fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
        });
        mostrarLoader(false);
        Swal.fire("Éxito", `Pago de Prima ${nombreSem} registrado`, "success");
        document.getElementById('txtFechaPagoPrima').value = "";
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}
async function guardarMovGenerico(tipo, sufijo, dias, actualizacion = {}) {
    const oficio = document.getElementById('txtNumOficio' + sufijo).value;
    const file = fileCache[sufijo];
    if (!file || !oficio) { Swal.fire("Faltan Datos", "Oficio y archivo obligatorios", "warning"); return; }

    mostrarLoader(true, "Subiendo...");
    try {
        const url = await subirArchivoStorage(file, `evidencias/${empleadoActual.id}/${Date.now()}_${file.name}`);
        const mov = {
            empleadoId: empleadoActual.id, nombreEmpleado: empleadoActual.nombre,
            tipo: tipo, dias: dias, oficio: oficio,
            folioMedico: sufijo === 'Incap' ? document.getElementById('txtFolioIncap').value : "",
            motivo: sufijo === 'Permiso' ? document.getElementById('txtMotivoPermiso').value : "",
            fechaInicio: document.getElementById('txtFecha' + sufijo).value,
            fechaFin: document.getElementById('txtFechaFin' + sufijo).value,
            urlEvidencia: url, fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("movimientos").add(mov);
        if (Object.keys(actualizacion).length > 0) await db.collection("empleados").doc(empleadoActual.docId).update(actualizacion);
        mostrarLoader(false);
        Swal.fire("Éxito", "", "success");
        resetForm(sufijo);
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === ALTA ===
async function registrarAlta() {
    const rawId = document.getElementById('altaID').value.trim();
    const id = rawId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const val = (elId) => { const el = document.getElementById(elId); return el && el.value ? (el.type === 'date' ? el.value : el.value.trim().toUpperCase()) : ""; };
    const file = fileCache['Alta'];
    if (!id || !file) { Swal.fire("Faltan datos", "ID y contrato obligatorios", "warning"); return; }
    if (!val('altaFecha')) { Swal.fire("Error", "Fecha de alta obligatoria", "warning"); return; }

    mostrarLoader(true, "Verificando...");
    try {
        const snap = await db.collection("empleados").doc(id).get();
        if (snap.exists) throw new Error("ID ya existe");
        const url = await subirArchivoStorage(file, `contratos/${id}_${Date.now()}.pdf`);
        const nuevo = {
            id, nombre: val('altaNombre'), fechaAlta: val('altaFecha'), depto: val('altaDepto'),
            puesto: val('altaPuesto'), tipo: val('altaTipo'), empresa: val('altaEmpresa'),
            curp: val('altaCurp'), oficioAlta: val('txtNumOficioAlta'), contratoUrl: url,
            estatus: "ACTIVO", saldoVac: 0, saldoEcon: 2, saldoPSG: 0, saldoIncap: 0, acumuladoFaltas: 0,
            direccion: val('altaDireccion'), tel: val('altaTel'), seguro: val('altaSeguro'),
            poliza: val('altaPoliza'), banco: val('altaBanco'), cuenta: val('altaCuenta'), clabe: val('altaClabe')
        };
        await db.collection("empleados").doc(id).set(nuevo);
        await db.collection("movimientos").add({ empleadoId: id, nombreEmpleado: nuevo.nombre, tipo: "ALTA", dias: 0, oficio: nuevo.oficioAlta, fechaInicio: nuevo.fechaAlta, fechaFin: "", urlEvidencia: url, fechaRegistro: firebase.firestore.FieldValue.serverTimestamp() });
        mostrarLoader(false);
        Swal.fire("Alta Exitosa", "", "success");
        document.getElementById('formAlta').reset();
        resetForm('Alta');
        document.getElementById('txtBuscarID').value = id;
        iniciarListeners(id);
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === ACTUALIZAR DATOS ===
async function actualizarDatos() {
    if (!validarSesion()) return;
    mostrarLoader(true);
    try {
        const val = (id) => document.getElementById(id).value || "";
        const file = fileCache['Edit'];
        let url = null;
        if (file) url = await subirArchivoStorage(file, `contratos/${empleadoActual.id}_${Date.now()}_UPD.pdf`);
        const upd = { depto: val('editDepto'), puesto: val('editPuesto'), tipo: val('editTipo'), empresa: val('editEmpresa'), oficioAlta: val('editNombramiento'), numArchivo: val('editArchivo'), direccion: val('editDireccion'), tel: val('editTel'), curp: val('editCurp'), banco: val('editBanco'), cuenta: val('editCuenta'), clabe: val('editClabe'), seguro: val('editSeguro'), poliza: val('editPoliza') };
        if (url) upd.contratoUrl = url;
        await db.collection("empleados").doc(empleadoActual.docId).update(upd);
        mostrarLoader(false);
        Swal.fire("Actualizado", "", "success");
        resetForm('Edit');
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === REPORTES ===
function generarReporte() {
    const fIni = document.getElementById('repFechaIni').value;
    const fFin = document.getElementById('repFechaFin').value;
    if (!fIni || !fFin) { Swal.fire("Fechas requeridas", "", "warning"); return; }
    mostrarLoader(true, "Generando reporte...");

    const tipoSel = document.getElementById('repTipo').value;

    // Lógica Especial: INCAPACITADOS ACTIVOS (Consulta a Colección Empleados en lugar de Movimientos)
    if (tipoSel === 'INCAPACITADOS_ACTIVOS') {
        db.collection("empleados").where("estatus_incapacidad", "==", true).get().then(qs => {
            const tbody = document.getElementById('tablaReportesBody');
            tbody.innerHTML = "";
            let dataExport = [];
            const empFilter = document.getElementById('repEmpleado').value.toUpperCase();

            qs.forEach(doc => {
                const d = doc.data();
                if (empFilter && !d.nombre.includes(empFilter) && !d.id.includes(empFilter)) return;
                
                tbody.innerHTML += `<tr>
                    <td>${d.fecha_inicio_incapacidad || '---'}</td>
                    <td><span class="badge bg-danger">ABIERTA</span></td>
                    <td>${d.nombre}</td>
                    <td><small>${d.depto || '---'}</small></td>
                    <td>${d.tipo_incapacidad || 'INCAPACITADO'}</td>
                    <td>---</td>
                    <td>PAGO AL ${d.porcentaje_pago_actual || 0}%</td>
                    <td>A la espera de RH</td>
                    <td>-</td>
                </tr>`;

                dataExport.push({
                    "Fecha Inicio": d.fecha_inicio_incapacidad || "",
                    "Fecha Fin": "ABIERTA",
                    "ID Empleado": d.id,
                    "Nombre": d.nombre,
                    "Departamento": d.depto || "---",
                    "Tipo": d.tipo_incapacidad || "INCAPACIDAD",
                    "Días": "N/A",
                    "Oficio": `PAGO AL ${d.porcentaje_pago_actual || 0}%`,
                    "Detalle": "Incidente Activo"
                });
            });

            window.datosReporteActual = dataExport;
            document.getElementById('repContador').innerText = `Resultados: ${dataExport.length}`;
            mostrarLoader(false);
        }).catch(error => {
            mostrarLoader(false);
            Swal.fire("Error", error.message, "error");
        });
        return;
    }

    // Lógica Estándar (Colección Movimientos)
    // CORRECCIÓN: Filtrar por fecha DIRECTAMENTE en la base de datos
    db.collection("movimientos")
        .where("fechaInicio", ">=", fIni)
        .where("fechaInicio", "<=", fFin)
        .orderBy("fechaInicio", "asc")
        .limit(2000)
        .get()
        .then(async qs => {
            const tbody = document.getElementById('tablaReportesBody');
            tbody.innerHTML = "";
            let dataExport = [];
            const empFilter = document.getElementById('repEmpleado').value.toUpperCase();

            if (qs.empty) {
                document.getElementById('repContador').innerText = "Resultados: 0";
                mostrarLoader(false);
                return;
            }

            // 1. Obtener lista de IDs de empleados únicos en el reporte
            const empleadosIds = new Set();
            const movimientosTemp = [];

            qs.forEach(doc => {
                const d = doc.data();
                // Filtros secundarios en cliente
                let pasa = true;
                if (empFilter && !d.nombreEmpleado.includes(empFilter) && !d.empleadoId.includes(empFilter)) pasa = false;

                if (tipoSel !== 'TODOS') {
                    if (tipoSel === 'PERMISOS') {
                        if (['VACACIONES', 'INCAPACIDAD', 'ALTA', 'HORAS_EXTRA', 'BAJA', 'PRIMA_VACACIONAL', 'PAGO_PRIMA_1SEM', 'PAGO_PRIMA_2SEM', 'INCIDENCIAS_VARIOS'].includes(d.tipo)) pasa = false;
                    }
                    else if (tipoSel === 'PAGO_PRIMA') { if (!d.tipo.startsWith('PAGO_PRIMA_')) pasa = false; }
                    else { if (d.tipo !== tipoSel) pasa = false; }
                }

                if (pasa) {
                    movimientosTemp.push(d);
                    if (d.empleadoId) empleadosIds.add(d.empleadoId);
                }
            });

            // 2. Obtener departamentos de esos empleados
            // Nota: Hacemos fetch de todos los empleados necesarios.
            // Si son pocos, podríamos hacer consultas individuales, pero mejor traemos info básica.
            mostrarLoader(true, `Consultando departamentos (${empleadosIds.size})...`);

            const mapaDeptos = {};
            if (empleadosIds.size > 0) {
                // Opción A: Consultar uno por uno (puede ser lento si son muchos)
                // Opción B: Consultar todos los empleados y filtrar (mejor si la BD no es gigante)
                // Vamos a intentar consultar solo los necesarios en lotes de 10 o todos si son pocos.

                // Estrategia robusta: Consultar los documentos de los empleados
                // Usamos Promise.all con un límite de concurrencia simple
                const ids = Array.from(empleadosIds);
                const chunks = [];
                for (let i = 0; i < ids.length; i += 10) {
                    chunks.push(ids.slice(i, i + 10));
                }

                // Firestore 'in' query supports up to 10
                for (const chunk of chunks) {
                    // Sin embargo, 'in' query es con where('id', 'in', chunk). 'id' es campo documento?
                    // Mejor hacemos getAll con promises
                    const promesas = chunk.map(id => db.collection("empleados").doc(id).get());
                    const snapshots = await Promise.all(promesas);
                    snapshots.forEach(snap => {
                        if (snap.exists) {
                            mapaDeptos[snap.id] = snap.data().depto || "SIN ASIGNAR";
                        }
                    });
                }
            }

            // 3. Renderizar tabla y preparar export
            movimientosTemp.forEach(d => {
                const depto = mapaDeptos[d.empleadoId] || "---";
                const link = d.urlEvidencia && d.urlEvidencia.startsWith('http') ? `<button class="btn btn-sm btn-link" onclick="window.open('${d.urlEvidencia}', '_blank')"><i class="bi bi-eye"></i></button>` : '-';

                tbody.innerHTML += `<tr>
                    <td>${d.fechaInicio}</td>
                    <td>${d.fechaFin || '-'}</td>
                    <td>${d.nombreEmpleado}</td>
                    <td><small>${depto}</small></td>
                    <td>${d.tipo}</td>
                    <td>${d.dias}</td>
                    <td>${d.oficio}</td>
                    <td>${d.motivo || d.folioMedico || ""}</td>
                    <td>${link}</td>
                </tr>`;

                // Agregar depto al objeto para exportación
                d.departamento = depto;
                dataExport.push(d);
            });

            window.datosReporteActual = dataExport;
            document.getElementById('repContador').innerText = `Resultados: ${dataExport.length}`;
            mostrarLoader(false);
        })
        .catch(error => {
            console.error("Error en reporte:", error);
            mostrarLoader(false);
            if (error.message.includes("index")) {
                Swal.fire("Error de Índice", "El sistema está creando el índice. Intente de nuevo en unos minutos.", "info");
            } else {
                Swal.fire("Error", "No se pudo generar el reporte: " + error.message, "error");
            }
        });
}

function descargarExcel() {
    if (!window.datosReporteActual || !window.datosReporteActual.length) { Swal.fire("Sin datos", "Genera reporte primero", "warning"); return; }
    const datosParaExcel = window.datosReporteActual.map(d => ({
        "Fecha Inicio": d.fechaInicio,
        "Fecha Fin": d.fechaFin || "",
        "ID Empleado": d.empleadoId,
        "Nombre": d.nombreEmpleado,
        "Departamento": d.departamento || "---",
        "Tipo": d.tipo,
        "Días": d.dias,
        "Oficio": d.oficio,
        "Detalle": d.motivo || d.folioMedico || ""
    }));
    const ws = XLSX.utils.json_to_sheet(datosParaExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    descargarExcelBlob(wb, "Reporte_RH.xlsx");
}

// === ESTATUS ===
async function actualizarEstatus() {
    if (!validarSesion()) return;
    const nuevoEstatus = document.getElementById('cmbNuevoEstatus').value;
    const file = fileCache['Baja'];
    if (!file && nuevoEstatus !== 'ACTIVO') { if (!confirm("¿Cambiar estatus sin evidencia?")) return; }
    mostrarLoader(true);
    try {
        let url = file ? await subirArchivoStorage(file, `evidencias/${empleadoActual.id}/${Date.now()}_BAJA_${file.name}`) : "";
        const fechaHoy = new Date().toISOString().split('T')[0];
        await db.collection("movimientos").add({ empleadoId: empleadoActual.id, nombreEmpleado: empleadoActual.nombre, tipo: "CAMBIO_ESTATUS", dias: 0, oficio: "CAMBIO A " + nuevoEstatus, fechaInicio: fechaHoy, fechaFin: fechaHoy, urlEvidencia: url, fechaRegistro: firebase.firestore.FieldValue.serverTimestamp() });
        
        let updateObj = { estatus: nuevoEstatus };
        if (nuevoEstatus === 'ACTIVO') {
            updateObj.estatus_incapacidad = false;
            updateObj.porcentaje_pago_actual = 100;
        }

        await db.collection("empleados").doc(empleadoActual.docId).update(updateObj);
        mostrarLoader(false);
        Swal.fire("Estatus Actualizado", `Empleado: ${nuevoEstatus}`, "success");
        resetForm('Baja');
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

// === CORRESPONDENCIA DE NÓMINA ===
let usuarioCorrespondencia = null;
let datosCorrespondenciaActual = [];

function abrirCorrespondencia() {
    const modal = new bootstrap.Modal(document.getElementById('modalCorrespondencia'));
    // Si ya hay sesión activa, mostrar panel principal
    if (usuarioCorrespondencia) {
        document.getElementById('panelLoginCorr').style.display = 'none';
        document.getElementById('panelCorrespondencia').style.display = 'block';
        document.getElementById('lblUsuarioCorr').innerText = usuarioCorrespondencia;
    } else {
        document.getElementById('panelLoginCorr').style.display = 'block';
        document.getElementById('panelCorrespondencia').style.display = 'none';
        document.getElementById('corrUsuario').value = '';
        document.getElementById('corrPassword').value = '';
    }
    modal.show();
}

async function loginCorrespondencia() {
    const usuario = document.getElementById('corrUsuario').value.trim().toUpperCase();
    const password = document.getElementById('corrPassword').value;
    if (!usuario || !password) { Swal.fire("Error", "Ingrese usuario y contraseña", "warning"); return; }

    mostrarLoader(true, "Verificando...");
    try {
        const snap = await db.collection("usuarios_nomina").doc(usuario).get();
        if (!snap.exists) {
            mostrarLoader(false);
            Swal.fire("Error", "Usuario no encontrado", "error");
            return;
        }
        const datos = snap.data();
        if (datos.contrasena !== password) {
            mostrarLoader(false);
            Swal.fire("Error", "Contraseña incorrecta", "error");
            return;
        }
        // Login exitoso
        usuarioCorrespondencia = usuario;
        document.getElementById('panelLoginCorr').style.display = 'none';
        document.getElementById('panelCorrespondencia').style.display = 'block';
        document.getElementById('lblUsuarioCorr').innerText = usuario;
        mostrarLoader(false);
        Swal.fire({ icon: 'success', title: 'Bienvenido', text: datos.nombre || usuario, timer: 1500, showConfirmButton: false });
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

function logoutCorrespondencia() {
    usuarioCorrespondencia = null;
    document.getElementById('panelLoginCorr').style.display = 'block';
    document.getElementById('panelCorrespondencia').style.display = 'none';
    document.getElementById('tablaCorrespondenciaBody').innerHTML = '';
    document.getElementById('corrContador').innerText = 'Resultados: 0';
    datosCorrespondenciaActual = [];
    resetForm('Corr');
}

async function guardarCorrespondencia() {
    if (!usuarioCorrespondencia) { Swal.fire("Error", "Sesión expirada", "error"); return; }
    const asunto = document.getElementById('txtAsuntoCorr').value.trim();
    const file = fileCache['Corr'];
    if (!asunto) { Swal.fire("Error", "Escriba el asunto", "warning"); return; }
    if (!file) { Swal.fire("Error", "Adjunte un archivo", "warning"); return; }

    mostrarLoader(true, "Guardando...");
    try {
        const url = await subirArchivoStorage(file, `correspondencia/${Date.now()}_${file.name}`);
        const fechaHoy = new Date().toISOString().split('T')[0];
        await db.collection("correspondencia_nomina").add({
            asunto: asunto,
            urlArchivo: url,
            fechaRegistro: fechaHoy,
            registradoPor: usuarioCorrespondencia,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        mostrarLoader(false);
        Swal.fire("Éxito", "Correspondencia registrada", "success");
        document.getElementById('txtAsuntoCorr').value = '';
        resetForm('Corr');
        buscarCorrespondencia(); // Actualizar tabla
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

async function buscarCorrespondencia() {
    if (!usuarioCorrespondencia) return;
    const fIni = document.getElementById('corrFechaIni').value;
    const fFin = document.getElementById('corrFechaFin').value;
    const buscarTexto = document.getElementById('corrBuscarAsunto').value.trim().toUpperCase();

    mostrarLoader(true, "Buscando...");
    try {
        const snapshot = await db.collection("correspondencia_nomina").orderBy("fechaRegistro", "desc").limit(200).get();
        const tbody = document.getElementById('tablaCorrespondenciaBody');
        tbody.innerHTML = '';
        datosCorrespondenciaActual = [];

        snapshot.forEach(doc => {
            const d = doc.data();
            let pasa = true;
            // Filtro por fechas
            if (fIni && d.fechaRegistro < fIni) pasa = false;
            if (fFin && d.fechaRegistro > fFin) pasa = false;
            // Filtro por texto
            if (buscarTexto && !d.asunto.toUpperCase().includes(buscarTexto)) pasa = false;

            if (pasa) {
                const link = d.urlArchivo ? `<button class="btn btn-sm btn-link" onclick="window.open('${d.urlArchivo}', '_blank')"><i class="bi bi-eye"></i></button>` : '-';
                tbody.innerHTML += `<tr><td>${d.fechaRegistro}</td><td>${d.asunto}</td><td>${d.registradoPor}</td><td>${link}</td></tr>`;
                datosCorrespondenciaActual.push(d);
            }
        });
        document.getElementById('corrContador').innerText = `Resultados: ${datosCorrespondenciaActual.length}`;
        mostrarLoader(false);
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

function exportarCorrespondenciaExcel() {
    if (!datosCorrespondenciaActual.length) { Swal.fire("Sin datos", "Busque primero", "warning"); return; }
    const datosExcel = datosCorrespondenciaActual.map(d => ({
        "Fecha": d.fechaRegistro,
        "Asunto": d.asunto,
        "Registrado Por": d.registradoPor,
        "Archivo": d.urlArchivo || ""
    }));
    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Correspondencia");
    descargarExcelBlob(wb, "Correspondencia_Nomina.xlsx");
}

// === ESTADÍSTICAS DE INCIDENCIAS ===
let chartInstances = {};
async function generarEstadisticas() {
    const fIni = document.getElementById('estFechaIni').value;
    const fFin = document.getElementById('estFechaFin').value;
    if (!fIni || !fFin) {
        Swal.fire("Fechas requeridas", "Seleccione Desde y Hasta para consultar", "warning");
        return;
    }
    mostrarLoader(true, "Consultando movimientos...");
    try {
        const qs = await db.collection("movimientos")
            .where("fechaInicio", ">=", fIni)
            .where("fechaInicio", "<=", fFin)
            .orderBy("fechaInicio", "asc")
            .limit(5000)
            .get();

        const tipos = {
            'JUSTIFICANTE_FALTA': {},
            'JUSTIFICANTE_RETARDO': {},
            'COMISION': {},
            'INCAPACIDAD': {}
        };
        // Agrupar por tipo > por empleado > sumar días
        qs.forEach(doc => {
            const d = doc.data();
            const t = d.tipo;
            // Incapacidades: agrupar todas las variantes
            let key = t;
            if (t === 'ENFERMEDAD GENERAL' || t === 'RIESGO TRABAJO' || t === 'MATERNIDAD' || t === 'INCAPACIDAD') {
                key = 'INCAPACIDAD';
            }
            if (tipos[key] !== undefined) {
                const nombre = d.nombreEmpleado || d.empleadoId || "Desconocido";
                if (!tipos[key][nombre]) tipos[key][nombre] = 0;
                tipos[key][nombre] += parseFloat(d.dias || 0);
            }
        });

        // Función para preparar Top 10
        function top10(obj) {
            return Object.entries(obj)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
        }

        const dataFaltas = top10(tipos['JUSTIFICANTE_FALTA']);
        const dataRetardos = top10(tipos['JUSTIFICANTE_RETARDO']);
        const dataComisiones = top10(tipos['COMISION']);
        const dataIncap = top10(tipos['INCAPACIDAD']);

        // Renderizar gráficas
        function renderChart(canvasId, data, color, borderColor) {
            if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
            const ctx = document.getElementById(canvasId).getContext('2d');
            const labels = data.map(d => d[0]);
            const values = data.map(d => d[1]);
            chartInstances[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Días',
                        data: values,
                        backgroundColor: color,
                        borderColor: borderColor,
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ctx.parsed.x + ' días'
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        },
                        y: {
                            ticks: { font: { size: 9 } }
                        }
                    }
                }
            });
        }

        renderChart('chartFaltas', dataFaltas, 'rgba(220, 53, 69, 0.7)', 'rgba(220, 53, 69, 1)');
        renderChart('chartRetardos', dataRetardos, 'rgba(255, 193, 7, 0.7)', 'rgba(255, 193, 7, 1)');
        renderChart('chartComisiones', dataComisiones, 'rgba(13, 110, 253, 0.7)', 'rgba(13, 110, 253, 1)');
        renderChart('chartIncapacidades', dataIncap, 'rgba(212, 160, 23, 0.7)', 'rgba(212, 160, 23, 1)');

        document.getElementById('seccionEstadisticas').style.display = 'block';
        mostrarLoader(false);

        if (qs.empty) {
            Swal.fire("Sin datos", "No se encontraron movimientos en el periodo seleccionado", "info");
        }
    } catch (e) {
        mostrarLoader(false);
        Swal.fire("Error", e.message, "error");
    }
}

document.getElementById('fechaSistema').innerText = new Date().toLocaleDateString();
window.onload = initApp;

// === HELPER: Forzar descarga con nombre correcto ===
function descargarExcelBlob(wb, nombreArchivo) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

// === CONTRASEÑA PARA EXCEL ===
const CLAVE_EXCEL = 'Navojoa2427';
let sesionExcelActiva = false;

async function validarClaveExcel() {
    if (sesionExcelActiva) return true;
    const { value: pass } = await Swal.fire({
        title: 'Acceso restringido',
        input: 'password',
        inputLabel: 'Ingrese la contraseña para continuar',
        inputPlaceholder: 'Contraseña',
        showCancelButton: true,
        confirmButtonText: 'Acceder',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#79242F',
        inputValidator: (v) => { if (!v) return 'Debe ingresar la contraseña'; }
    });
    if (!pass) return false;
    if (pass !== CLAVE_EXCEL) {
        Swal.fire('Contraseña incorrecta', '', 'error');
        return false;
    }
    sesionExcelActiva = true;
    return true;
}

// === MAPEO DE COLUMNAS PARA PLANTILLA ===
const EXCEL_COLUMNS = [
    { header: 'ID', field: 'id' },
    { header: 'NOMBRE', field: 'nombre' },
    { header: 'ESTATUS', field: 'estatus' },
    { header: 'DEPENDENCIA', field: 'depto' },
    { header: 'PUESTO', field: 'puesto' },
    { header: 'TIPO', field: 'tipo' },
    { header: 'EMPRESA', field: 'empresa' },
    { header: 'FECHA_ALTA', field: 'fechaAlta' },
    { header: 'CURP', field: 'curp' },
    { header: 'TELEFONO', field: 'tel' },
    { header: 'DIRECCION', field: 'direccion' },
    { header: 'SEGURO', field: 'seguro' },
    { header: 'POLIZA', field: 'poliza' },
    { header: 'BANCO', field: 'banco' },
    { header: 'CUENTA', field: 'cuenta' },
    { header: 'CLABE', field: 'clabe' },
    { header: 'NO_ARCHIVO', field: 'numArchivo' },
    { header: 'NOMBRAMIENTO', field: 'oficioAlta' },
    { header: 'SALDO_VAC', field: 'saldoVac' },
    { header: 'SALDO_ECON', field: 'saldoEcon' },
    { header: 'SALDO_PSG', field: 'saldoPSG' },
    { header: 'SALDO_INCAP', field: 'saldoIncap' },
    { header: 'ACUM_FALTAS', field: 'acumuladoFaltas' },
    { header: 'ACUM_RETARDOS', field: 'acumuladoRetardos' },
    { header: 'ACUM_LUTO', field: 'acumuladoLuto' },
    { header: 'ACUM_COMISIONES', field: 'acumuladoComisiones' }
];

// === DESCARGAR PLANTILLA COMPLETA ===
async function descargarPlantillaCompleta() {
    if (!(await validarClaveExcel())) return;
    mostrarLoader(true, "Descargando plantilla...");
    try {
        const snapshot = await db.collection('empleados').get();
        if (snapshot.empty) {
            mostrarLoader(false);
            Swal.fire('Sin datos', 'No hay empleados registrados.', 'info');
            return;
        }
        const rows = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            const row = {};
            EXCEL_COLUMNS.forEach(col => {
                let val = d[col.field];
                if (val === undefined || val === null) val = '';
                row[col.header] = val;
            });
            rows.push(row);
        });
        const ws = XLSX.utils.json_to_sheet(rows, { header: EXCEL_COLUMNS.map(c => c.header) });
        ws['!cols'] = EXCEL_COLUMNS.map(c => ({ wch: c.header === 'NOMBRE' || c.header === 'DIRECCION' ? 35 : c.header === 'CURP' || c.header === 'CLABE' ? 22 : 15 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
        const fecha = new Date().toISOString().split('T')[0];
        descargarExcelBlob(wb, `Plantilla_RH_NAVOJOA_${fecha}.xlsx`);
        mostrarLoader(false);
        Swal.fire('Descargado', `${rows.length} empleados exportados a Excel.`, 'success');
    } catch (e) {
        mostrarLoader(false);
        console.error(e);
        Swal.fire('Error', 'No se pudo descargar: ' + e.message, 'error');
    }
}

// === DESCARGAR PLANTILLA VACÍA (TEMPLATE) ===
function descargarPlantillaVacia() {
    const headers = EXCEL_COLUMNS.map(c => c.header);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = EXCEL_COLUMNS.map(c => ({ wch: c.header === 'NOMBRE' || c.header === 'DIRECCION' ? 35 : c.header === 'CURP' || c.header === 'CLABE' ? 22 : 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    descargarExcelBlob(wb, 'Plantilla_Carga_RH_NAVOJOA.xlsx');
    Swal.fire('Plantilla descargada', 'Llena los datos usando esta plantilla y luego cárgala con el botón "Cargar".', 'info');
}

// === CARGAR EXCEL MASIVO ===
async function cargarExcelMasivo(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!(await validarClaveExcel())) { event.target.value = ''; return; }
    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) {
            Swal.fire('Vacío', 'El archivo Excel no tiene filas de datos.', 'warning');
            event.target.value = '';
            return;
        }
        if (!rows[0].hasOwnProperty('ID')) {
            Swal.fire('Error de formato', 'El Excel debe tener una columna llamada "ID". Descarga la plantilla vacía para ver el formato correcto.', 'error');
            event.target.value = '';
            return;
        }
        const confirm = await Swal.fire({
            icon: 'question',
            title: 'Confirmar carga masiva',
            html: `Se procesarán <b>${rows.length}</b> registros.<br><br><small class="text-muted">IDs existentes se actualizarán. IDs nuevos se crearán.</small>`,
            showCancelButton: true,
            confirmButtonText: 'Sí, procesar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#79242F'
        });
        if (!confirm.isConfirmed) { event.target.value = ''; return; }
        mostrarLoader(true, "Procesando carga masiva...");
        let actualizados = 0, nuevos = 0, errores = 0;
        const erroresDetalle = [];
        for (const row of rows) {
            const id = String(row['ID'] || '').trim().toUpperCase();
            if (!id) { errores++; erroresDetalle.push('Fila sin ID'); continue; }
            try {
                const docData = {};
                EXCEL_COLUMNS.forEach(col => {
                    if (col.header === 'ID') return;
                    if (row.hasOwnProperty(col.header) && row[col.header] !== '') {
                        let val = row[col.header];
                        if (col.field.startsWith('saldo') || col.field.startsWith('acumulado')) val = parseFloat(val) || 0;
                        docData[col.field] = val;
                    }
                });
                docData.id = id;
                const docRef = db.collection('empleados').doc(id);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    await docRef.update(docData);
                    actualizados++;
                } else {
                    if (docData.saldoVac === undefined) docData.saldoVac = 0;
                    if (docData.saldoEcon === undefined) docData.saldoEcon = 2;
                    if (docData.saldoPSG === undefined) docData.saldoPSG = 0;
                    if (docData.saldoIncap === undefined) docData.saldoIncap = 0;
                    if (docData.acumuladoFaltas === undefined) docData.acumuladoFaltas = 0;
                    if (docData.acumuladoRetardos === undefined) docData.acumuladoRetardos = 0;
                    if (docData.acumuladoLuto === undefined) docData.acumuladoLuto = 0;
                    if (docData.acumuladoComisiones === undefined) docData.acumuladoComisiones = 0;
                    if (!docData.estatus) docData.estatus = 'ACTIVO';
                    await docRef.set(docData);
                    nuevos++;
                }
            } catch (err) {
                errores++;
                erroresDetalle.push(`ID ${id}: ${err.message}`);
            }
        }
        mostrarLoader(false);
        let resumenHtml = `<b>Actualizados:</b> ${actualizados}<br><b>Nuevos:</b> ${nuevos}`;
        if (errores > 0) resumenHtml += `<br><b class="text-danger">Errores:</b> ${errores}<br><small>${erroresDetalle.slice(0, 5).join('<br>')}</small>`;
        Swal.fire({ icon: errores > 0 ? 'warning' : 'success', title: 'Carga completada', html: resumenHtml });
    } catch (e) {
        mostrarLoader(false);
        console.error(e);
        Swal.fire('Error', 'No se pudo procesar el archivo: ' + e.message, 'error');
    }
    event.target.value = '';
}
