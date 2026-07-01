'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useReadContract, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { parseUnits } from 'viem';

// Cüzdan bağlayıcıları
import { coinbaseWallet } from 'wagmi/connectors';

// Mock user data (People in the area)
interface MockUser {
  address: string;
  name: string;
  avatar: string;
  bio: string;
  interests: string[];
}

const MOCK_USERS: MockUser[] = [
  {
    address: '0x3333333333333333333333333333333333333333',
    name: 'Merve .base.eth',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    bio: 'Coffee lover, Next.js fan. Currently coding at the corner table.',
    interests: ['Technology', 'Coffee', 'Web3']
  },
  {
    address: '0x6666666666666666666666666666666666666666',
    name: 'Can .base.eth',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    bio: 'Here for the concert, rock music enthusiast. Having a beer.',
    interests: ['Music', 'Beer', 'Travel']
  },
  {
    address: '0x7777777777777777777777777777777777777777',
    name: 'Elif .base.eth',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    bio: 'Love exploring creative streets. Designer & photographer.',
    interests: ['Art', 'Design', 'Photography']
  }
];

// Mock Venues (Fallback reference)
interface Venue {
  id: string;
  name: string;
  hash: string;
  address: string;
}

const MOCK_VENUES: Venue[] = [
  {
    id: 'babylon',
    name: 'Babylon Kadıköy',
    hash: '0x84fca8b47c014798e4d2a13cc2f88cf50da50f6bf3b6326cd66099b247f42ff1',
    address: 'Caferağa Mah. Moda Cad. No: 12, Kadıköy'
  },
  {
    id: 'karga',
    name: 'Karga Bar',
    hash: '0x94fca8b47c014798e4d2a13cc2f88cf50da50f6bf3b6326cd66099b247f42ff2',
    address: 'Moda Cad. No: 16, Kadıköy'
  }
];

export default function Home() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  // Akıllı sözleşme çağrıları
  const { writeContractAsync } = useWriteContract();

  // Uygulama Durumları (States)
  const [step, setStep] = useState<'landing' | 'scanning' | 'verifying-gps' | 'checked-in'>('landing');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [gpsLoadingText, setGpsLoadingText] = useState('');
  const [activeUsers, setActiveUsers] = useState<MockUser[]>(MOCK_USERS);
  const [chatUser, setChatUser] = useState<MockUser | null>(null);
  const [chatMessages, setChatMessages] = useState<{ sender: 'me' | 'them'; text?: string; photoUrl?: string; nftId?: string; txHash?: string; time: string }[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [paidUsers, setPaidUsers] = useState<Record<string, boolean>>({});
  const [reportedUsers, setReportedUsers] = useState<Record<string, boolean>>({});
  const [demoMode, setDemoMode] = useState<boolean>(true); // Varsayılan olarak demo modunda çalıştır, işlem kolaylığı için
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // NFT Durumları
  const [isMintingNFT, setIsMintingNFT] = useState(false);
  const [mintingStatusText, setMintingStatusText] = useState('');
  const [showPhotoPresets, setShowPhotoPresets] = useState(false);

  // Havuz ve Aktivite Durumları
  const [poolBalance, setPoolBalance] = useState<number>(25.50);
  const [myUsageCount, setMyUsageCount] = useState<number>(8);

  // Görsel Presetleri
  const PHOTO_PRESETS = [
    { name: '☕ Kahve Latteil', url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500' },
    { name: '🎸 Konser Sahnesi', url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500' },
    { name: '✨ Mekan Detayı', url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500' }
  ];

  // Sözleşme adresleri (Base Mainnet)
  const REGISTRY_ADDRESS = '0xef64853f3f5605d3b66412b591b659c042171e97'; // Kendi Mainnet CheckInRegistry adresinizle değiştirin
  const ROUTER_ADDRESS = '0x1c288b8ee5ff3e7de76c12e30dba71bc41d2797e';   // Kendi Mainnet MessageFeeRouter adresinizle değiştirin
  const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';     // Base Mainnet Resmi Native USDC Adresi
  const NFT_ADDRESS = '0xb59a72171e976e848ee5ff3e7de76c12e30dba71bc';      // Kendi Mainnet ChatPhotoNFT adresinizle değiştirin
  const VENUE_OWNER_ADDRESS = '0x5555555555555555555555555555555555555555';

  // Hata/Bilgi Toast Mesajı gösterici
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    if (isConnected) {
      if (step === 'landing') {
        setStep('landing'); // Giriş yaptı, check-in bekliyor
      }
    } else {
      setStep('landing');
      setSelectedVenue(null);
    }
  }, [isConnected]);

  // Location Submission and Check-in Flow (GPS-based)
  const handleLocationCheckIn = async () => {
    if (!address) {
      showToast("Please connect your wallet first");
      return;
    }

    setStep('verifying-gps');
    setGpsLoadingText('Requesting GPS location access...');
    
    let latitude = 40.9882; // Default Kadikoy
    let longitude = 29.0254;

    try {
      // Read actual location using browser GPS API
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 0
        });
      });
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      setGpsLoadingText(`GPS Location Acquired: (${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E)`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      console.warn("GPS permission denied, using simulated location.", err);
      setGpsLoadingText('GPS permission not granted. Using simulated location (40.9882° N, 29.0254° E)...');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    try {
      setGpsLoadingText('Verifying regional location area...');
      await new Promise((resolve) => setTimeout(resolve, 800));

      setGpsLoadingText('Requesting secure validator signature...');
      
      // 1. Resolve region, signature, and match query from server
      const response = await fetch('/api/gps-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          latitude,
          longitude
        }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Save resolved region
      setSelectedVenue({
        id: data.venueHash,
        name: data.venueName,
        hash: data.venueHash,
        address: 'Active Regional Location Area'
      });

      // Match notification
      if (data.matchFound) {
        showToast(`📍 Match found in the same region (${data.venueName})! Notification sent to your wallet.`);
      }

      if (demoMode) {
        // Demo mode
        showToast(`Demo Mode: Check-in and notification for ${data.venueName} simulated!`);
        setStep('checked-in');
        return;
      }

      // 2. Contract call
      if (chainId !== base.id) {
        setGpsLoadingText("Switching network to Base Mainnet...");
        await switchChainAsync({ chainId: base.id });
      }

      setGpsLoadingText("Please approve the transaction in your wallet...");
      const tx = await writeContractAsync({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'checkIn',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'venueHash', type: 'bytes32' },
              { name: 'duration', type: 'uint64' },
              { name: 'sigExpirationTimestamp', type: 'uint256' },
              { name: 'gpsSignature', type: 'bytes' }
            ]
          }
        ],
        functionName: 'checkIn',
        args: [
          data.venueHash as `0x${string}`,
          BigInt(10800), // 3 hours
          BigInt(data.sigExpirationTimestamp),
          data.signature as `0x${string}`
        ]
      });

      showToast(`Check-in approved! Tx: ${tx.substring(0, 10)}...`);
      setStep('checked-in');
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || 'Location verification failed'}`);
      setStep('landing');
    }
  };

  // Messaging and Fee Payment Flow
  const handleOpenChat = (user: MockUser) => {
    setChatUser(user);
    // Check if the initial message fee has been paid
    const hasPaid = paidUsers[user.address] || false;
    
    if (hasPaid) {
      setChatMessages([
        { sender: 'them', text: `Hi! My name is ${user.name.split(' ')[0]}. Nice to meet you!`, time: 'Just now' }
      ]);
    } else {
      setChatMessages([]);
    }
  };

  const handlePayFirstMessage = async () => {
    if (!chatUser || !address) return;

    try {
      showToast("Initiating payment transaction...");

      if (demoMode) {
        // Demo Mode
        setPaidUsers(prev => ({ ...prev, [chatUser.address]: true }));
        setPoolBalance(prev => prev + 0.01);
        setMyUsageCount(prev => prev + 1);
        showToast("Demo Payment: 0.01 USDC successfully paid!");
        setChatMessages([
          { sender: 'them', text: `Hi! Thanks for paying the initial message fee. Our chat is now free!`, time: 'Just now' }
        ]);
        return;
      }

      // Real contract call: MessageFeeRouter.payFirstMessage
      if (chainId !== base.id) {
        showToast("Please approve the network switch in your wallet...");
        await switchChainAsync({ chainId: base.id });
      }

      showToast("Waiting for wallet approval...");
      const tx = await writeContractAsync({
        address: ROUTER_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'payFirstMessage',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'recipient', type: 'address' },
              { name: 'venueHash', type: 'bytes32' },
              { name: 'venueOwner', type: 'address' }
            ]
          }
        ],
        functionName: 'payFirstMessage',
        args: [
          chatUser.address as `0x${string}`,
          (selectedVenue?.hash || MOCK_VENUES[0].hash) as `0x${string}`,
          VENUE_OWNER_ADDRESS as `0x${string}` // Example venue owner
        ]
      });

      showToast(`Payment approved! Tx: ${tx.substring(0, 10)}...`);
      setPaidUsers(prev => ({ ...prev, [chatUser.address]: true }));
      setPoolBalance(prev => prev + 0.01);
      setMyUsageCount(prev => prev + 1);
      setChatMessages([
        { sender: 'them', text: `Hi! Thanks for paying the initial message fee. Our chat is now free!`, time: 'Just now' }
      ]);
    } catch (err: any) {
      console.error(err);
      showToast(`Payment Error: ${err.message || 'Transaction cancelled'}`);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !chatUser) return;

    const newMsg = {
      sender: 'me' as const,
      text: newMessageText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, newMsg]);
    setNewMessageText('');

    // Trigger auto mock response (after 1.5s)
    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'them' as const,
          text: `If I had a witty response I would write it here! Real messaging can be integrated on the backend.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }, 1500);
  };

  // Photo NFT Minting Flow
  const handleSendPhotoNFT = async (photoUrl: string) => {
    if (!chatUser || !address) return;
    setShowPhotoPresets(false);
    setIsMintingNFT(true);

    try {
      setMintingStatusText('Preparing photo...');
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      setMintingStatusText('Creating NFT Metadata (IPFS simulation)...');
      await new Promise((resolve) => setTimeout(resolve, 800));

      setMintingStatusText('Minting NFT on Base...');

      let tokenId = Math.floor(Math.random() * 10000).toString();
      let txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');

      if (!demoMode) {
        if (chainId !== base.id) {
          setMintingStatusText("Switching network to Base...");
          await switchChainAsync({ chainId: base.id });
        }

        setMintingStatusText('Confirm the NFT minting in your wallet...');
        // ChatPhotoNFT.mint(recipient, uri) contract call
        const tx = await writeContractAsync({
          address: NFT_ADDRESS as `0x${string}`,
          abi: [
            {
              name: 'mint',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'recipient', type: 'address' },
                { name: 'uri', type: 'string' }
              ]
            }
          ],
          functionName: 'mint',
          args: [
            chatUser.address as `0x${string}`,
            `ipfs://QmBuradayimChatNFT/photo_${tokenId}.json`
          ]
        });
        txHash = tx;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      showToast("Photo successfully sent to recipient's wallet as an NFT!");

      // Add NFT message to chat history
      const newMsg = {
        sender: 'me' as const,
        photoUrl: photoUrl,
        nftId: `#${tokenId}`,
        txHash: txHash,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => [...prev, newMsg]);

      // Trigger automatic thanks response
      setTimeout(() => {
        setChatMessages(prev => [
          ...prev,
          {
            sender: 'them' as const,
            text: `Awesome photo! And it already arrived in my wallet as an on-chain NFT 🌟 Thank you!`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }, 2000);

    } catch (err: any) {
      console.error(err);
      showToast(`NFT Minting Error: ${err.message || 'Transaction cancelled'}`);
    } finally {
      setIsMintingNFT(false);
      setMintingStatusText('');
    }
  };

  // Upload Photo from Device Camera/Gallery
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Pass image to NFT minting function
      handleSendPhotoNFT(base64String);
    };
    reader.readAsDataURL(file);
  };

  // User Reporting & Blocking
  const handleReportUser = (userAddr: string) => {
    setReportedUsers(prev => ({ ...prev, [userAddr]: true }));
    setChatUser(null);
    showToast("User reported and blocked. You will no longer see them.");
  };

  // Cüzdan Bağlama Tetikleyici
  const handleConnectWallet = () => {
    connect({ connector: coinbaseWallet({ appName: 'OnBase', preference: 'smartWalletOnly' }) });
  };

  return (
    <div className="flex flex-col min-h-screen ambient-glow">
      {/* Toast Bildirimi */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 glass-card px-6 py-3 rounded-full text-sm font-semibold border-rose-500/40 text-rose-200 shadow-lg shadow-rose-500/10">
          {toastMessage}
        </div>
      )}

      {/* Üst Bar (Navbar) */}
      <header className="w-full py-4 px-6 flex justify-between items-center border-b border-white/5 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center font-bold text-white tracking-wider text-sm shadow-md shadow-rose-500/20">
            OB
          </div>
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-rose-400 to-pink-300 bg-clip-text text-transparent">
            OnBase
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Demo Mod Toggle Butonu */}
          <button 
            onClick={() => {
              setDemoMode(!demoMode);
              showToast(demoMode ? "Gerçek Web3 moduna geçildi (Cüzdan onayı istenir)" : "Demo/Simüle moduna geçildi (Testnet bakiyesi gerektirmez)");
            }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              demoMode 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {demoMode ? '✨ Demo Mode (Active)' : '🔗 Web3 Mode'}
          </button>

          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs text-slate-400">Smart Wallet</span>
                <span className="text-sm font-mono text-slate-200">
                  {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
                </span>
              </div>
              <button
                onClick={() => disconnect()}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-white/5 border border-white/10 hover:bg-rose-500/20 hover:text-rose-100 hover:border-rose-500/30 transition-all cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer hover:scale-[1.02]"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg w-full mx-auto pb-24">
        
        {/* Step 1: Landing Page (Wallet Disconnected) */}
        {!isConnected && (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-rose-500/10 hover:scale-105 transition-transform duration-300">
              📍
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-4">
              Discover <br />
              <span className="bg-gradient-to-r from-rose-400 via-pink-400 to-rose-400 bg-clip-text text-transparent">
                People Nearby
              </span>
            </h1>
            <p className="text-slate-400 text-base mb-8 max-w-sm leading-relaxed">
              "OnBase" lets you discover people around you instantly and securely by sharing your regional location. With zero gas fees and zero wallet setup required!
            </p>
            <button
              onClick={handleConnectWallet}
              className="w-full py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer hover:scale-[1.01]"
            >
              Sign In with Passkey / Smart Wallet
            </button>
            <span className="text-xs text-slate-500 mt-3">
              * Create a gasless wallet in seconds using Coinbase Smart Wallet.
            </span>
          </div>
        )}

        {/* Step 2: Signed In, No Check-in */}
        {isConnected && step === 'landing' && (
          <div className="w-full text-center py-8">
            <h2 className="text-2xl font-bold mb-2 text-slate-100">Welcome! 👋</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              To discover other users around you, you need to check in regionally. You will be automatically assigned to a zone using your GPS location.
            </p>

            <button
              onClick={handleLocationCheckIn}
              className="w-full py-8 rounded-3xl bg-gradient-to-tr from-slate-900 to-slate-800 border border-rose-500/20 hover:border-rose-500/40 text-slate-100 flex flex-col items-center justify-center gap-4 transition-all hover:scale-[1.01] shadow-lg shadow-slate-950/50 cursor-pointer group"
            >
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 group-hover:bg-rose-500/20 transition-all">
                <span className="text-3xl">📍</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-lg text-rose-300">Submit Regional Location</span>
                <span className="text-xs text-slate-400 px-6">
                  Grant location permission in seconds to see people on the same street, campus, park, or concert hall.
                </span>
              </div>
            </button>
          </div>
        )}

        {/* Step 4: GPS Location Verifying */}
        {isConnected && step === 'verifying-gps' && (
          <div className="w-full text-center py-16 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-rose-500 border-t-transparent animate-spin mb-6"></div>
            <h4 className="text-xl font-bold mb-2">GPS Location Verification</h4>
            <p className="text-slate-400 text-sm max-w-xs">{gpsLoadingText}</p>
          </div>
        )}

        {/* Step 5: Checked-in (Show people in region) */}
        {isConnected && step === 'checked-in' && selectedVenue && (
          <div className="w-full flex flex-col gap-6">
            
            {/* Venue Info Card */}
            <div className="w-full glass-card p-5 rounded-3xl relative overflow-hidden border-rose-500/20">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl"></div>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 pulse-badge"></div>
                  <span className="text-xs font-semibold text-rose-400 uppercase tracking-widest">Active Check-in</span>
                </div>
                <span className="text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">Expires in: 3h 0m</span>
              </div>
              <h3 className="text-2xl font-black text-slate-50">{selectedVenue.name}</h3>
              <p className="text-xs text-slate-400 mt-1">{selectedVenue.address}</p>
              
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs text-slate-400">
                <span>EAS Attestation: <span className="text-emerald-400 font-mono">Created ✓</span></span>
                <button 
                  onClick={() => setStep('landing')} 
                  className="text-rose-400 hover:underline"
                >
                  Check-out
                </button>
              </div>
            </div>

            {/* Activity & Reward Pool Card */}
            <div className="w-full glass-card p-4 rounded-3xl border-pink-500/10 flex justify-between items-center relative overflow-hidden bg-slate-900/40">
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold text-pink-300 uppercase tracking-widest">🏆 Total Reward Pool</span>
                <span className="text-xl font-black text-slate-50 mt-0.5">{poolBalance.toFixed(2)} USDC</span>
                <span className="text-[9px] text-slate-400 mt-1">* Distributed to the top 3 active users.</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] font-bold text-rose-300 uppercase tracking-widest">⚡ My Activity Score</span>
                <span className="text-xl font-black text-slate-50 mt-0.5">{myUsageCount} Points</span>
                <span className="text-[9px] text-slate-400 mt-1">* Each paid chat adds +1 point.</span>
              </div>
            </div>

            {/* List of People in Region */}
            <div>
              <h4 className="text-sm font-semibold text-slate-400 tracking-wider mb-3 px-1">
                PEOPLE IN THE SAME REGION ({activeUsers.filter(u => !reportedUsers[u.address]).length})
              </h4>
              
              <div className="flex flex-col gap-3">
                {activeUsers
                  .filter(u => !reportedUsers[u.address])
                  .map(u => (
                    <div
                      key={u.address}
                      onClick={() => handleOpenChat(u)}
                      className="w-full glass-card glass-card-hover p-4 rounded-2xl flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={u.avatar} 
                          alt={u.name} 
                          className="w-12 h-12 rounded-xl object-cover border border-white/10"
                        />
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-sm text-slate-100">{u.name}</span>
                          <span className="text-xs text-slate-400 line-clamp-1 max-w-[200px]">
                            {u.bio}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {u.interests.slice(0, 2).map((interest, idx) => (
                          <span key={idx} className="text-[10px] bg-white/5 text-slate-300 px-2 py-0.5 rounded-md">
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Chat Section */}
      {chatUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col max-w-lg w-full mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-slate-900/90">
            <div className="flex items-center gap-3">
              <img 
                src={chatUser.avatar} 
                alt={chatUser.name} 
                className="w-10 h-10 rounded-xl object-cover"
              />
              <div className="flex flex-col text-left">
                <span className="font-bold text-sm text-slate-100">{chatUser.name}</span>
                <span className="text-[10px] text-slate-400">Online (Same region)</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReportUser(chatUser.address)}
                className="p-2 rounded-xl hover:bg-rose-500/10 text-rose-400 text-xs font-semibold transition-all border border-rose-500/20"
                title="Report & Block"
              >
                🚨 Block
              </button>
              <button
                onClick={() => setChatUser(null)}
                className="p-2 rounded-xl hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all border border-white/10"
              >
                Close
              </button>
            </div>
          </div>

          {/* Chat Gövdesi */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            
            {/* Paywall - If payment not made */}
            {!paidUsers[chatUser.address] && (
              <div className="my-auto text-center flex flex-col items-center gap-5 glass-card p-6 rounded-3xl border-rose-500/30 shadow-lg shadow-rose-500/5 max-w-sm mx-auto">
                <div className="text-4xl">💬</div>
                <h5 className="font-extrabold text-lg text-rose-300">First Contact Payment</h5>
                <p className="text-xs text-slate-300 leading-relaxed">
                  To prevent spam and fake accounts, starting a chat requires a <strong className="text-slate-50">0.01 USDC</strong> fee. 
                  <br /><br />
                  This fee accumulates in a shared pool and is distributed as rewards to the top 3 most active users! After they reply, all subsequent messages are completely free.
                </p>
                <button
                  onClick={handlePayFirstMessage}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold shadow-md shadow-rose-500/20 transition-all cursor-pointer hover:scale-[1.01]"
                >
                  Pay 0.01 USDC & Start
                </button>
                <span className="text-[10px] text-slate-500">
                  * The fee is deducted from your wallet's USDC balance.
                </span>
              </div>
            )}

            {/* Message List - If paid */}
            {paidUsers[chatUser.address] && chatMessages.length === 0 && (
              <div className="text-center text-xs text-slate-500 my-auto">
                Chat started! You can send your first message below.
              </div>
            )}

            {paidUsers[chatUser.address] && chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col max-w-[80%] ${
                  msg.sender === 'me' ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl text-sm ${
                    msg.sender === 'me'
                      ? 'bg-rose-500 text-white rounded-br-none'
                      : 'bg-slate-800 text-slate-100 rounded-bl-none'
                  }`}
                >
                  {msg.text && <div>{msg.text}</div>}
                  {msg.photoUrl && (
                    <div className="flex flex-col gap-2 p-1">
                      <img 
                        src={msg.photoUrl} 
                        alt="NFT Chat" 
                        className="max-w-[200px] w-full rounded-xl border border-white/10 shadow-lg object-cover"
                      />
                      <div className="flex flex-col gap-0.5 bg-slate-950/40 p-2 rounded-xl border border-white/5 text-[10px] text-slate-300">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-rose-300">🖼️ Onchain NFT</span>
                          {msg.nftId && <span className="text-[9px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">{msg.nftId}</span>}
                        </div>
                        {msg.txHash && (
                          <>
                            <a
                              href={`https://basescan.org/tx/${msg.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-rose-400 hover:underline hover:text-rose-300 flex items-center gap-1 font-mono text-[9px] truncate"
                            >
                              🔍 Tx: {msg.txHash.substring(0, 12)}...
                            </a>
                            
                            <a
                              href={`https://warpcast.com/~/compose?text=I%20just%20met%20someone%20nearby%20using%20OnBase%20and%20got%20this%20onchain%20NFT%20photo!%20%F0%9F%93%8D%E2%9C%A8&embeds[]=${encodeURIComponent(`https://basescan.org/tx/${msg.txHash}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 py-1 px-2 rounded bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 transition-all flex items-center justify-center gap-1 text-[9px] font-bold"
                            >
                              🟣 Cast on Farcaster
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-slate-500 mt-1">{msg.time}</span>
              </div>
            ))}

            {/* NFT Minting Status Indicator */}
            {isMintingNFT && (
              <div className="mx-auto flex flex-col items-center gap-2 glass-card px-5 py-3.5 rounded-2xl border-rose-500/30 shadow-lg shadow-rose-500/10">
                <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent animate-spin rounded-full"></div>
                <span className="text-xs text-rose-300 font-semibold">{mintingStatusText}</span>
              </div>
            )}
          </div>

          {/* Chat Bottom Entry Section */}
          {paidUsers[chatUser.address] && (
            <div className="relative">
              {/* Photo Presets Popup Menu */}
              {showPhotoPresets && (
                <div className="absolute bottom-full left-4 mb-2 p-3 glass-card rounded-2xl flex flex-col gap-2 z-50 shadow-2xl border-rose-500/20 max-w-[250px] w-full">
                  <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider mb-1 px-1">Send Photo as NFT</span>
                  
                  {/* Live Camera / Gallery Button */}
                  <button
                    type="button"
                    onClick={() => {
                      document.getElementById('photo-upload-input')?.click();
                    }}
                    className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-gradient-to-r from-rose-500/20 to-pink-600/20 border border-rose-500/30 hover:from-rose-500/30 hover:to-pink-600/30 transition-all text-xs font-bold text-rose-300"
                  >
                    📸 Select Camera or Gallery
                  </button>

                  <div className="h-px bg-white/5 my-1"></div>

                  {PHOTO_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendPhotoNFT(preset.url)}
                      className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900 border border-white/5 hover:border-rose-500/30 hover:bg-slate-800 transition-all text-xs font-semibold text-slate-200"
                    >
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <form 
                onSubmit={handleSendMessage}
                className="p-4 border-t border-white/5 bg-slate-900/90 flex gap-2"
              >
                {/* Hidden File Input */}
                <input
                  type="file"
                  accept="image/*"
                  id="photo-upload-input"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isMintingNFT}
                />

                {/* Send Photo Button */}
                <button
                  type="button"
                  onClick={() => setShowPhotoPresets(!showPhotoPresets)}
                  disabled={isMintingNFT}
                  className="px-3 rounded-xl bg-slate-800 border border-white/10 hover:border-rose-500/40 text-lg hover:text-rose-300 transition-all disabled:opacity-50"
                  title="Send Photo NFT"
                >
                  🖼️
                </button>

                <input
                  type="text"
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={isMintingNFT ? "Minting NFT..." : "Type your message..."}
                  disabled={isMintingNFT}
                  className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-rose-500 disabled:opacity-50"
                />
                
                <button
                  type="submit"
                  disabled={isMintingNFT || !newMessageText.trim()}
                  className="px-5 py-3 bg-gradient-to-r from-rose-500 to-pink-600 rounded-xl text-sm font-bold text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
