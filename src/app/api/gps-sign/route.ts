import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodePacked } from 'viem';

// Geliştirme/Test ortamı için sabit bir özel anahtar
const VALIDATOR_PRIVATE_KEY = process.env.VALIDATOR_PRIVATE_KEY || '0x47e179ec1974d858c087d903044d3024c080e03e5c9b1395464e83260c6d2679';
const account = privateKeyToAccount(VALIDATOR_PRIVATE_KEY as `0x${string}`);

// Base Dashboard API Anahtarı
const BASE_DASHBOARD_API_KEY = process.env.BASE_DASHBOARD_API_KEY || '';

// Kadıköy Moda Bölgesi Hash'i (Viem uyumlu keccak256)
const KADIKOY_MODA_HASH = keccak256(encodePacked(['string'], ['Kadikoy_Moda_Bolgesi']));

// Sunucu hafızasındaki aktif check-in'ler
interface CheckInRecord {
  userAddress: string;
  venueHash: string;
  timestamp: number;
}
const activeCheckInsMemory: CheckInRecord[] = [
  // Kadıköy Moda bölgesinde önceden bulunan mock kullanıcılar
  {
    userAddress: '0x3333333333333333333333333333333333333333',
    venueHash: KADIKOY_MODA_HASH,
    timestamp: Date.now()
  },
  {
    userAddress: '0x6666666666666666666666666666666666666666',
    venueHash: KADIKOY_MODA_HASH,
    timestamp: Date.now()
  }
];

/**
 * Koordinatları genel bir Bölgeye (Zone) çözümler.
 */
function resolveZoneFromCoordinates(lat: number, lng: number): { name: string; hash: string } {
  // Kadıköy koordinat sınırları: ~40.97 - 41.01 N, ~29.00 - 29.05 E
  if (lat >= 40.96 && lat <= 41.02 && lng >= 28.99 && lng <= 29.06) {
    return {
      name: "Kadıköy Moda Bölgesi",
      hash: KADIKOY_MODA_HASH
    };
  }
  
  // Beşiktaş koordinat sınırları: ~41.03 - 41.07 N, ~29.00 - 29.03 E
  if (lat >= 41.02 && lat <= 41.08 && lng >= 28.98 && lng <= 29.04) {
    const hash = keccak256(encodePacked(['string'], ['Besiktas_Carsi_Bolgesi']));
    return {
      name: "Beşiktaş Çarşı Bölgesi",
      hash
    };
  }

  // Fallback: Herhangi bir yerdeki koordinat bazlı dinamik bölge
  const zoneName = `${lat.toFixed(3)}° N, ${lng.toFixed(3)}° E Bölgesi`;
  const hash = keccak256(encodePacked(['string'], [zoneName]));
  return {
    name: zoneName,
    hash
  };
}

/**
 * Base Dashboard Notifications API aracılığıyla cüzdan adresine push bildirim gönderir.
 */
async function sendBaseNotification(walletAddress: string, title: string, body: string) {
  if (!BASE_DASHBOARD_API_KEY) {
    console.log(`[Base Notification - Simüle] Alıcı: ${walletAddress} | Başlık: ${title} | İçerik: ${body}`);
    return false;
  }

  try {
    const response = await fetch('https://api.base.org/v1/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BASE_DASHBOARD_API_KEY}`
      },
      body: JSON.stringify({
        walletAddresses: [walletAddress],
        title: title,
        body: body,
        actionUrl: 'https://buradayim.app/'
      })
    });

    if (!response.ok) {
      throw new Error(`API Hatası: ${response.statusText}`);
    }

    console.log(`[Base Notification - Gerçek] Başarıyla gönderildi. Alıcı: ${walletAddress}`);
    return true;
  } catch (error) {
    console.error(`[Base Notification - Hata] Bildirim gönderilemedi:`, error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { userAddress, latitude, longitude } = await request.json();

    if (!userAddress || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'userAddress, latitude ve longitude parametreleri zorunludur' },
        { status: 400 }
      );
    }

    // 1. Koordinatları bölgeye çözümler
    const zone = resolveZoneFromCoordinates(latitude, longitude);
    console.log(`[Bölge Çözümleme] Kullanıcı: ${userAddress} | Konum: ${latitude}, ${longitude} => Bölge: ${zone.name}`);

    // 2. İmzanın geçerlilik süresi (10 dakika)
    const sigExpirationTimestamp = Math.floor(Date.now() / 1000) + 600;

    // İmza mesajı hash'i oluşturuluyor (Çözümlenen bölge hash'i kullanılıyor)
    const messageHash = keccak256(
      encodePacked(
        ['address', 'bytes32', 'uint256'],
        [userAddress as `0x${string}`, zone.hash as `0x${string}`, BigInt(sigExpirationTimestamp)]
      )
    );

    // Mesaj imzalanıyor
    const signature = await account.signMessage({
      message: { raw: messageHash }
    });

    // 3. Eşleşme Kontrolü (Bölge Bazlı)
    const matchedRecords = activeCheckInsMemory.filter(
      record => record.venueHash === zone.hash && record.userAddress.toLowerCase() !== userAddress.toLowerCase()
    );

    let matchFound = false;
    let matchedUser = '';
    let notificationSent = false;

    if (matchedRecords.length > 0) {
      matchFound = true;
      matchedUser = matchedRecords[0].userAddress;

      // 4. Base Dashboard Bildirimi Gönder
      const notificationTitle = `Aynı Bölgede Eşleşme! 📍`;
      const notificationBody = `${zone.name} sınırlarında sizinle ortak ilgi alanlarına sahip biri var. Keşfetmek için uygulamaya girin!`;
      
      notificationSent = await sendBaseNotification(userAddress, notificationTitle, notificationBody);
      await sendBaseNotification(matchedUser, notificationTitle, `Aynı bölgede yeni bir kullanıcı check-in yaptı! Tanışmak için hemen tıklayın.`);
    }

    // Kullanıcının kendi check-in kaydını in-memory DB'ye ekle
    activeCheckInsMemory.push({
      userAddress,
      venueHash: zone.hash,
      timestamp: Date.now()
    });

    return NextResponse.json({
      signature,
      sigExpirationTimestamp,
      validatorAddress: account.address,
      venueHash: zone.hash,
      venueName: zone.name,
      matchFound,
      matchedUser,
      notificationSent
    });
  } catch (error: any) {
    console.error('İşlem hatası:', error);
    return NextResponse.json(
      { error: 'Sunucu işlem sırasında hata yaşadı' },
      { status: 500 }
    );
  }
}
