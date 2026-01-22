// === SISTEMA RH NAVOJOA v87.0 (CORREGIDO) ===
// CORRECCIONES: Eliminadas funciones duplicadas, lógica Artículo 100 activa

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
    safeText('lblAcumLuto', e.acumuladoLuto || 0);
    safeText('lblAcumComisiones', e.acumuladoComisiones || 0);
    safeText('lblAcumFaltas', e.acumuladoFaltas || 0);
    safeText('lblAcumRetardos', e.acumuladoRetardos || 0);
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
    const estatusFijos = ['BAJA', 'JUBILADO', 'PENSIONADO', 'SUSPENDIDO'];
    if (estatusFijos.some(s => e.estatus && e.estatus.includes(s))) return { texto: e.estatus, clase: 'estatus-' + e.estatus.split(' ')[0].toLowerCase() };
    const now = new Date();
    const hoy = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    if (e.movimientos && e.movimientos.length > 0) {
        const mov = e.movimientos.find(m => hoy >= m.fechaInicio && hoy <= m.fechaFin);
        if (mov) {
            if (mov.tipo === 'VACACIONES') return { texto: 'DE VACACIONES', clase: 'estatus-vacaciones' };
            if (mov.tipo === 'INCAPACIDAD') return { texto: 'INCAPACITADO', clase: 'estatus-incapacidad' };
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
            const msg = `<b>Antigüedad:</b> ${antiguedad.toFixed(1)} años<br><b>Límite:</b> ${limite} días<br><b>Acumulado:</b> ${acumulado}<br><b>Nuevo total:</b> ${nuevoTotal}<br><br>¿Registrar excediendo límite?`;
            const result = await Swal.fire({ icon: 'warning', title: '¡ALERTA ARTÍCULO 100!', html: msg, showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, registrar' });
            if (!result.isConfirmed) return;
        }
    }
    await guardarMovGenerico("INCAPACIDAD", "Incap", dias, { saldoIncap: (empleadoActual.saldoIncap || 0) + dias });
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
    mostrarLoader(true);
    db.collection("movimientos").limit(200).get().then(qs => {
        const tbody = document.getElementById('tablaReportesBody');
        tbody.innerHTML = "";
        let dataExport = [];
        const empFilter = document.getElementById('repEmpleado').value.toUpperCase();
        const tipoSel = document.getElementById('repTipo').value;
        qs.forEach(doc => {
            const d = doc.data();
            let pasa = d.fechaInicio >= fIni && d.fechaInicio <= fFin;
            if (empFilter && !d.nombreEmpleado.includes(empFilter) && !d.empleadoId.includes(empFilter)) pasa = false;
            if (tipoSel !== 'TODOS') {
                if (tipoSel === 'PERMISOS') { if (['VACACIONES', 'INCAPACIDAD', 'ALTA', 'HORAS_EXTRA', 'BAJA', 'PRIMA_VACACIONAL', 'PAGO_PRIMA_1SEM', 'PAGO_PRIMA_2SEM'].includes(d.tipo)) pasa = false; }
                else if (tipoSel === 'PAGO_PRIMA') { if (!d.tipo.startsWith('PAGO_PRIMA_')) pasa = false; }
                else { if (d.tipo !== tipoSel) pasa = false; }
            }
            if (pasa) {
                let link = d.urlEvidencia && d.urlEvidencia.startsWith('http') ? `<button class="btn btn-sm btn-link" onclick="window.open('${d.urlEvidencia}', '_blank')"><i class="bi bi-eye"></i></button>` : '-';
                tbody.innerHTML += `<tr><td>${d.fechaInicio}</td><td>${d.fechaFin || '-'}</td><td>${d.nombreEmpleado}</td><td>${d.tipo}</td><td>${d.dias}</td><td>${d.oficio}</td><td>${d.motivo || d.folioMedico || ""}</td><td>${link}</td></tr>`;
                dataExport.push(d);
            }
        });
        window.datosReporteActual = dataExport;
        document.getElementById('repContador').innerText = `Resultados: ${dataExport.length}`;
        mostrarLoader(false);
    });
}

function descargarExcel() {
    if (!window.datosReporteActual || !window.datosReporteActual.length) { Swal.fire("Sin datos", "Genera reporte primero", "warning"); return; }
    const datosParaExcel = window.datosReporteActual.map(d => ({ "Fecha Inicio": d.fechaInicio, "Fecha Fin": d.fechaFin || "", "ID Empleado": d.empleadoId, "Nombre": d.nombreEmpleado, "Tipo": d.tipo, "Días": d.dias, "Oficio": d.oficio, "Detalle": d.motivo || d.folioMedico || "" }));
    const ws = XLSX.utils.json_to_sheet(datosParaExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, "Reporte_RH.xlsx");
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
        await db.collection("empleados").doc(empleadoActual.docId).update({ estatus: nuevoEstatus });
        mostrarLoader(false);
        Swal.fire("Estatus Actualizado", `Empleado: ${nuevoEstatus}`, "success");
        resetForm('Baja');
    } catch (e) { mostrarLoader(false); Swal.fire("Error", e.message, "error"); }
}

document.getElementById('fechaSistema').innerText = new Date().toLocaleDateString();
window.onload = initApp;
