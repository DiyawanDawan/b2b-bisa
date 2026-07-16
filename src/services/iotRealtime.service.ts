import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { BiomassaType, UserRole } from '#prisma';
import { predictBiocharQuality } from '#services/ai.service';
import { assertDeviceAccess } from '#services/iot.service';

/** Sesi pirolisis aktif per device (in-memory — reset saat server restart). */
type PyrolysisSession = {
  deviceId: string;
  userId: string;
  startedAt: Date;
  biomassaType: BiomassaType;
  beratInput: number;
};

const activeSessions = new Map<string, PyrolysisSession>();

const round1 = (n: number) => Math.round(n * 10) / 10;

export const getPyrolysisSession = async (deviceId: string, userId: string, userRole: UserRole) => {
  await assertDeviceAccess(deviceId, userId, userRole);
  const session = activeSessions.get(deviceId);
  if (!session) return null;
  const elapsedMin = Math.max(1, Math.round((Date.now() - session.startedAt.getTime()) / 60_000));
  return {
    active: true,
    startedAt: session.startedAt.toISOString(),
    elapsedMinutes: elapsedMin,
    biomassaType: session.biomassaType,
    beratInput: session.beratInput,
  };
};

export const startPyrolysisSession = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
  data: { biomassaType: BiomassaType; beratInput: number },
) => {
  const device = await assertDeviceAccess(deviceId, userId, userRole);
  activeSessions.set(deviceId, {
    deviceId,
    userId,
    startedAt: new Date(),
    biomassaType: data.biomassaType,
    beratInput: data.beratInput,
  });
  return {
    deviceId: device.id,
    deviceName: device.name || device.deviceId,
    session: await getPyrolysisSession(deviceId, userId, userRole),
  };
};

export const stopPyrolysisSession = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
) => {
  await assertDeviceAccess(deviceId, userId, userRole);
  const had = activeSessions.has(deviceId);
  activeSessions.delete(deviceId);
  return { stopped: had };
};

type TelemetrySnapshot = {
  currentTemp: number | null;
  avgTemp: number | null;
  maxTemp: number | null;
  minTemp: number | null;
  readingCount: number;
  lastReadingAt: string | null;
  windowMinutes: number;
};

export const loadTelemetrySnapshot = async (
  deviceId: string,
  since: Date,
  windowMinutes: number,
): Promise<TelemetrySnapshot> => {
  const readings = await prisma.iotReading.findMany({
    where: { deviceId, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'desc' },
    take: 500,
  });

  if (readings.length === 0) {
    return {
      currentTemp: null,
      avgTemp: null,
      maxTemp: null,
      minTemp: null,
      readingCount: 0,
      lastReadingAt: null,
      windowMinutes,
    };
  }

  const temps = readings.map((r) => Number(r.temperature));
  const sum = temps.reduce((a, b) => a + b, 0);

  return {
    currentTemp: round1(temps[0]),
    avgTemp: round1(sum / temps.length),
    maxTemp: round1(Math.max(...temps)),
    minTemp: round1(Math.min(...temps)),
    readingCount: readings.length,
    lastReadingAt: readings[0].recordedAt.toISOString(),
    windowMinutes,
  };
};

/** Telemetri terkini — prioritas sesi pirolisis aktif, else 30 menit terakhir. */
export const getCurrentDeviceTelemetry = async (deviceId: string): Promise<TelemetrySnapshot> => {
  const session = activeSessions.get(deviceId);
  const windowMinutes = session ? 120 : 30;
  const since = session ? session.startedAt : new Date(Date.now() - windowMinutes * 60_000);
  return loadTelemetrySnapshot(deviceId, since, windowMinutes);
};

/**
 * Analisis kualitas realtime dari telemetri MAX6675 + sesi pirolisis.
 * Suhu: rata-rata readings dalam window; waktu: durasi sesi aktif atau override manual.
 */
export const analyzeDeviceRealtime = async (
  deviceId: string,
  userId: string,
  userRole: UserRole,
  options: {
    biomassaType?: BiomassaType;
    beratInput?: number;
    waktuPembakaranMin?: number;
    windowMinutes?: number;
    savePrediction?: boolean;
  } = {},
) => {
  const device = await assertDeviceAccess(deviceId, userId, userRole);
  const session = activeSessions.get(deviceId);

  const windowMinutes = options.windowMinutes ?? (session ? 120 : 30);
  const since = session ? session.startedAt : new Date(Date.now() - windowMinutes * 60_000);

  const telemetry = await loadTelemetrySnapshot(deviceId, since, windowMinutes);

  const suhu =
    telemetry.avgTemp ??
    telemetry.currentTemp ??
    (
      await prisma.iotReading.findFirst({
        where: { deviceId },
        orderBy: { recordedAt: 'desc' },
      })
    )?.temperature;

  if (suhu == null || !Number.isFinite(Number(suhu))) {
    throw new AppError(
      'Belum ada data suhu dari sensor. Pastikan ESP32/MAX6675 mengirim ke POST /iot/data.',
      400,
    );
  }

  const suhuNum = round1(Number(suhu));
  let waktuMin: number;
  if (session) {
    waktuMin = Math.max(1, Math.round((Date.now() - session.startedAt.getTime()) / 60_000));
  } else if (options.waktuPembakaranMin != null) {
    waktuMin = Math.round(options.waktuPembakaranMin);
  } else {
    waktuMin = 120;
  }

  const biomassaType = options.biomassaType ?? session?.biomassaType ?? BiomassaType.SEKAM_PADI;
  const beratInput = options.beratInput ?? session?.beratInput ?? 1000;

  const predictInput = {
    biomassaType,
    suhuPirolisis: suhuNum,
    waktuPembakaran: waktuMin,
    beratInput,
  };

  let predictionRecord = null;
  if (options.savePrediction !== false) {
    predictionRecord = await predictBiocharQuality(userId, predictInput, {
      meta: {
        source: 'iot-realtime',
        deviceId: device.id,
        deviceName: device.name || device.deviceId,
        telemetry,
        inputs: predictInput,
      },
    });
  }

  return {
    deviceId: device.id,
    deviceName: device.name || device.deviceId,
    source: 'iot-realtime',
    session: await getPyrolysisSession(deviceId, userId, userRole),
    telemetry,
    inputs: {
      biomassaType,
      suhuPirolisis: suhuNum,
      waktuPembakaran: waktuMin,
      beratInput,
      suhuSource: telemetry.avgTemp != null ? 'avg_window' : 'latest_reading',
    },
    prediction: predictionRecord
      ? {
          id: predictionRecord.id,
          predictedGrade: predictionRecord.predictedGrade,
          predictedYield: Number(predictionRecord.predictedYield),
          cOrganik: Number(predictionRecord.cOrganik),
          dosis: Number(predictionRecord.dosis),
          rawOutput: predictionRecord.rawOutput,
          createdAt: predictionRecord.createdAt,
        }
      : null,
    analyzedAt: new Date().toISOString(),
  };
};
