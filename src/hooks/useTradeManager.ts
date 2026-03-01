import { useState, useRef, useEffect } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { ActiveTrade, Currency } from '../types';
import type { TradePartner } from '../components/TradePartnerModal';
import { mapItemsToTradePartners } from '../utils/tradePartners';
import { ACTIVE_TRADE_KEY, TRADE_POPOVER_ID } from '../constants';
import type { CharacterData } from '../types';

interface UseTradeManagerParams {
  ready: boolean;
  playerId: string | null;
  playerRole: 'GM' | 'PLAYER';
  playerClaimedTokenId: string | null;
  checkProximity: (tokenId1: string, tokenId2: string) => Promise<boolean>;
}

export interface UseTradeManagerResult {
  activeTrade: ActiveTrade | null;
  showTradeRequest: boolean;
  pendingTradeRequest: ActiveTrade | null;
  showTradePartnerModal: boolean;
  setShowTradePartnerModal: React.Dispatch<React.SetStateAction<boolean>>;
  tradePartners: TradePartner[];
  loadingTradePartners: boolean;
  handleAcceptTrade: () => Promise<void>;
  handleDeclineTrade: () => Promise<void>;
  handleCancelTrade: () => Promise<void>;
  handleOpenTradePartnerModal: () => Promise<void>;
  handlePartnerSelected: (partner: TradePartner) => Promise<void>;
}

export function useTradeManager({
  ready,
  playerId,
  playerRole,
  playerClaimedTokenId,
  checkProximity,
}: UseTradeManagerParams): UseTradeManagerResult {
  const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(null);
  const tradeWindowOpenedForIdRef = useRef<string | null>(null);
  const [showTradeRequest, setShowTradeRequest] = useState(false);
  const [pendingTradeRequest, setPendingTradeRequest] = useState<ActiveTrade | null>(null);

  const [showTradePartnerModal, setShowTradePartnerModal] = useState(false);
  const [tradePartners, setTradePartners] = useState<TradePartner[]>([]);
  const [loadingTradePartners, setLoadingTradePartners] = useState(false);

  // Open separate trade window - defined early to be available in useEffect
  const openTradeWindow = (tradeId: string) => {
    // Prevent opening multiple windows for the same trade
    if (tradeWindowOpenedForIdRef.current === tradeId) return;

    OBR.popover.open({
      id: TRADE_POPOVER_ID,
      url: '/trade',
      height: 600,
      width: 800,
    });

    tradeWindowOpenedForIdRef.current = tradeId;
  };

  // Load active trade from room metadata
  useEffect(() => {
    if (!ready || !playerId) return;

    const loadTradeData = async () => {
      const metadata = await OBR.room.getMetadata();
      const trade = metadata[ACTIVE_TRADE_KEY] as ActiveTrade | undefined;

      console.log('[TRADE POLL] Active trade:', trade ? `P2P (${trade.status})` : 'null');

      if (trade) {
        setActiveTrade(trade);

        // Check if this is a pending trade request for the current player
        if (trade.status === 'pending-acceptance' && trade.player2Id === playerId) {
          setPendingTradeRequest(trade);
          setShowTradeRequest(true);
        }

        // Check if this is an active trade involving the current player
        if (trade.status === 'active' && (trade.player1Id === playerId || trade.player2Id === playerId)) {
          // Open trade window if not already open (ref-based check prevents duplicates)
          openTradeWindow(trade.id);
          setShowTradeRequest(false);
          setPendingTradeRequest(null);
        }
      } else {
        setActiveTrade(null);
        setShowTradeRequest(false);
        setPendingTradeRequest(null);
        tradeWindowOpenedForIdRef.current = null;
      }
    };

    loadTradeData();

    // Poll for changes to trade data every 2 seconds
    const interval = setInterval(loadTradeData, 2000);

    return () => clearInterval(interval);
  }, [ready, playerId]);

  // Accept trade request
  const handleAcceptTrade = async () => {
    if (!pendingTradeRequest) return;

    const updatedTrade: ActiveTrade = {
      ...pendingTradeRequest,
      status: 'active',
    };

    await OBR.room.setMetadata({ [ACTIVE_TRADE_KEY]: updatedTrade });
    setShowTradeRequest(false);
    setPendingTradeRequest(null);
    openTradeWindow(updatedTrade.id);
  };

  // Decline trade request
  const handleDeclineTrade = async () => {
    if (!pendingTradeRequest) return;

    // Clear the trade from metadata
    await OBR.room.setMetadata({ [ACTIVE_TRADE_KEY]: undefined });
    setShowTradeRequest(false);
    setPendingTradeRequest(null);
  };

  // Cancel active trade
  const handleCancelTrade = async () => {
    if (!activeTrade) return;

    // Check if current player can cancel
    const canCancel =
      activeTrade.player1Id === playerId ||
      activeTrade.player2Id === playerId ||
      playerRole === 'GM';

    if (!canCancel) {
      alert('Only involved players or GM can cancel this trade.');
      return;
    }

    console.log('[TRADE] Clearing active trade from room metadata');
    await OBR.room.setMetadata({ [ACTIVE_TRADE_KEY]: undefined });
    console.log('[TRADE] Active trade cleared');
  };

  // Start player-to-player trade (request)
  const handleStartP2PTrade = async (otherPlayerTokenId: string) => {
    // Check if current player has a claimed token
    if (!playerClaimedTokenId || !playerId) {
      alert('You must claim a token before you can trade! Find your character token and click "CLAIM TOKEN".');
      return;
    }

    // Check proximity between player's claimed token and other player's token
    const isNear = await checkProximity(playerClaimedTokenId, otherPlayerTokenId);
    if (!isNear) {
      alert('Your character must be near the other player to trade!');
      return;
    }

    // Check if a trade is already active
    if (activeTrade) {
      alert('A trade is already in progress!');
      return;
    }

    // Get other player's info
    const tokens = await OBR.scene.items.getItems([otherPlayerTokenId]);
    if (tokens.length === 0) return;

    const otherTokenName = tokens[0].name || 'Unknown Player';
    const otherTokenData = tokens[0].metadata['com.weighted-inventory/data'] as CharacterData;
    const otherPlayerId = otherTokenData?.claimedBy;

    if (!otherPlayerId) {
      alert('The other token must be claimed by a player to trade!');
      return;
    }

    // Get player's claimed token name
    const playerTokens = await OBR.scene.items.getItems([playerClaimedTokenId]);
    const playerTokenName = playerTokens.length > 0 ? playerTokens[0].name || 'Unknown' : 'Unknown';

    // Start P2P trade with pending-acceptance status
    const trade: ActiveTrade = {
      id: uuidv4(),
      status: 'pending-acceptance',
      player1TokenId: playerClaimedTokenId,
      player1Id: playerId,
      player1Name: playerTokenName,
      player2TokenId: otherPlayerTokenId,
      player2Id: otherPlayerId,
      player2Name: otherTokenName,
      player1OfferedItems: [],
      player1OfferedCoins: { cp: 0, sp: 0, gp: 0, pp: 0 } as Currency,
      player2OfferedItems: [],
      player2OfferedCoins: { cp: 0, sp: 0, gp: 0, pp: 0 } as Currency,
      player1Confirmed: false,
      player2Confirmed: false,
      timestamp: Date.now(),
    };

    await OBR.room.setMetadata({ [ACTIVE_TRADE_KEY]: trade });
    alert('Trade request sent! Waiting for the other player to accept...');
  };

  // Direct trade between player's own tokens (no request needed)
  const handleStartDirectTrade = async (otherTokenId: string) => {
    if (!playerClaimedTokenId || !playerId) return;

    // Get both tokens' info
    const tokens = await OBR.scene.items.getItems([playerClaimedTokenId, otherTokenId]);
    const playerToken = tokens.find(t => t.id === playerClaimedTokenId);
    const otherToken = tokens.find(t => t.id === otherTokenId);

    if (!playerToken || !otherToken) {
      alert('Could not find the tokens for trade.');
      return;
    }

    const playerTokenName = playerToken.name || 'Unknown';
    const otherTokenName = otherToken.name || 'Unknown';

    // Start trade with 'active' status immediately (no acceptance needed)
    const trade: ActiveTrade = {
      id: uuidv4(),
      status: 'active',
      player1TokenId: playerClaimedTokenId,
      player1Id: playerId,
      player1Name: playerTokenName,
      player2TokenId: otherTokenId,
      player2Id: playerId,  // Same player owns both tokens
      player2Name: otherTokenName,
      player1OfferedItems: [],
      player1OfferedCoins: { cp: 0, sp: 0, gp: 0, pp: 0 } as Currency,
      player2OfferedItems: [],
      player2OfferedCoins: { cp: 0, sp: 0, gp: 0, pp: 0 } as Currency,
      player1Confirmed: false,
      player2Confirmed: false,
      timestamp: Date.now(),
    };

    await OBR.room.setMetadata({ [ACTIVE_TRADE_KEY]: trade });
    // The existing useEffect will detect the active trade and open the trade window
  };

  // Open trade partner modal and fetch nearby trade partners
  const handleOpenTradePartnerModal = async () => {
    // Check if current player has a claimed token
    if (!playerClaimedTokenId || !playerId) {
      alert('You must claim a token before you can trade! Find your character token and click "CLAIM TOKEN".');
      return;
    }

    // Check if a trade is already active
    if (activeTrade) {
      alert('A trade is already in progress!');
      return;
    }

    setShowTradePartnerModal(true);
    setLoadingTradePartners(true);
    setTradePartners([]);

    try {
      // Get all items from the scene
      const items = await OBR.scene.items.getItems();

      // Map items to trade partners
      const allPartners = mapItemsToTradePartners(
        items.map(item => ({
          id: item.id,
          name: item.name,
          metadata: item.metadata,
          image: (item as { image?: { url: string } }).image,
        })),
        playerClaimedTokenId,
        playerId,
        playerRole
      );

      // Filter to nearby partners only
      const nearbyPartners: TradePartner[] = [];
      for (const partner of allPartners) {
        const isNear = await checkProximity(playerClaimedTokenId, partner.tokenId);
        if (isNear) {
          nearbyPartners.push(partner);
        }
      }

      setTradePartners(nearbyPartners);
    } catch (err) {
      console.error('Failed to load trade partners:', err);
    } finally {
      setLoadingTradePartners(false);
    }
  };

  // Handle partner selection from the modal
  const handlePartnerSelected = async (partner: TradePartner) => {
    setShowTradePartnerModal(false);

    if (partner.ownerType === 'self' || partner.ownerType === 'party') {
      // Instant trade - open trade window directly for trading between own tokens or party tokens
      // Party tokens are accessible to everyone, so no acceptance needed
      await handleStartDirectTrade(partner.tokenId);
    } else if (partner.ownerType === 'merchant') {
      // Instant trade with merchant - merchants work like party tokens (no request needed)
      await handleStartDirectTrade(partner.tokenId);
    } else {
      // Send trade request for other players and NPCs
      await handleStartP2PTrade(partner.tokenId);
    }
  };

  return {
    activeTrade,
    showTradeRequest,
    pendingTradeRequest,
    showTradePartnerModal,
    setShowTradePartnerModal,
    tradePartners,
    loadingTradePartners,
    handleAcceptTrade,
    handleDeclineTrade,
    handleCancelTrade,
    handleOpenTradePartnerModal,
    handlePartnerSelected,
  };
}
