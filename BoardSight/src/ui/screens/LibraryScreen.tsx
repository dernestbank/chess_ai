import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { initDb } from '../../data/db';
import { GameRow } from '../../data/models';
import { deleteGame, GameStats, getGameStats, listGames } from '../../data/repositories';
import { LibraryProps } from '../navigation/types';
import { ColorPalette, useTheme } from '../theme';

const MODE_ICONS: Record<string, string> = {
  otb: '📷',
  bot: '🤖',
  multiplayer: '🌐',
};

const RESULT_COLOR: Record<string, string> = {
  '1-0': '#48bb78',
  '0-1': '#fc8181',
  '1/2-1/2': '#fbd38d',
  '*': '#718096',
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - ms) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

function countMoves(pgn: string): number {
  if (!pgn) return 0;
  // Count move numbers like "1." "2." etc.
  return (pgn.match(/\d+\./g) ?? []).length;
}

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    searchRow: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: t.bgCard, borderRadius: 12, paddingHorizontal: 12 },
    searchInput: { flex: 1, color: t.text, fontSize: 15, paddingVertical: 12 },
    clearBtn: { padding: 8 },
    clearBtnText: { color: t.textMuted, fontSize: 16 },
    list: { paddingHorizontal: 12, paddingBottom: 40 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgCard, borderRadius: 12, padding: 14, marginBottom: 10 },
    cardLeft: { marginRight: 12 },
    modeIcon: { fontSize: 24 },
    cardBody: { flex: 1 },
    players: { color: t.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
    meta: { color: t.textMuted, fontSize: 12 },
    cardRight: { marginLeft: 12 },
    result: { fontSize: 16, fontWeight: 'bold' },
    empty: { paddingTop: 80, alignItems: 'center' },
    emptyText: { color: t.textMuted, fontSize: 15 },
    hint: { textAlign: 'center', color: t.textFaint, fontSize: 12, padding: 8, paddingBottom: 16 },
    bulkExportBtn: { marginHorizontal: 12, marginBottom: 8, backgroundColor: t.bgCard, borderRadius: 10, padding: 12, alignItems: 'center' },
    bulkExportText: { color: t.textMuted, fontSize: 13 },
    statsBar: {
      marginHorizontal: 12,
      marginBottom: 8,
      backgroundColor: t.bgCard,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: 'center',
    },
    statsBarText: { color: t.textMuted, fontSize: 13 },
    statsWin: { color: t.accentGreen },
    statsDraw: { color: t.accentGold },
    statsLoss: { color: t.accentRed },
  });
}

export function LibraryScreen({ navigation }: LibraryProps): React.JSX.Element {
  const [games, setGames] = useState<GameRow[]>([]);
  const [filtered, setFiltered] = useState<GameRow[]>([]);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<GameStats | null>(null);
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGames = useCallback(async () => {
    try {
      await initDb();
      const rows = listGames(200);
      setGames(rows);
      setFiltered(rows);
      setStats(getGameStats());
    } catch (err) {
      console.error('LibraryScreen load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  // Filter on search change
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(games);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(games.filter(g =>
      g.player_white?.toLowerCase().includes(q) ||
      g.player_black?.toLowerCase().includes(q) ||
      g.result.includes(q) ||
      g.mode.includes(q),
    ));
  }, [search, games]);

  const handleDelete = useCallback((game: GameRow) => {
    Alert.alert(
      'Delete Game',
      `Delete this ${game.mode} game from ${formatDate(game.created_at)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteGame(game.id);
            setGames(prev => prev.filter(g => g.id !== game.id));
          },
        },
      ],
    );
  }, []);

  const handleBulkExport = useCallback(async () => {
    // Fetch ALL games (not just the 200 displayed in the list) for a full export
    const allGames = listGames(10_000);
    const exportable = allGames.filter(g => g.pgn && g.pgn.trim().length > 0);
    if (exportable.length === 0) {
      Alert.alert('Nothing to export', 'No games with recorded moves found.');
      return;
    }
    const bulk = exportable.map(g => g.pgn).join('\n\n');
    try {
      await Share.share({
        message: bulk,
        title: 'BoardSight Games',
      });
    } catch (err) {
      Alert.alert('Export failed', String(err));
    }
  }, []);

  const renderItem = ({ item }: { item: GameRow }) => {
    const moveCount = countMoves(item.pgn);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Review', { gameId: item.id })}
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.modeIcon}>{MODE_ICONS[item.mode] ?? '♟'}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.players}>
            {item.player_white ?? 'White'} vs {item.player_black ?? 'Black'}
          </Text>
          <Text style={styles.meta}>
            {moveCount} moves · {formatDate(item.created_at)}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.result, { color: RESULT_COLOR[item.result] ?? '#718096' }]}>
            {item.result}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by player or result…"
          placeholderTextColor="#4a5568"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats summary bar */}
      {stats !== null && stats.total > 0 && (
        <View style={styles.statsBar}>
          <Text style={styles.statsBarText}>
            <Text>{stats.total} games  •  </Text>
            <Text style={styles.statsWin}>✓ {stats.wins}</Text>
            <Text>  </Text>
            <Text style={styles.statsDraw}>═ {stats.draws}</Text>
            <Text>  </Text>
            <Text style={styles.statsLoss}>✗ {stats.losses}</Text>
            <Text>  •  {(stats.wins + stats.draws + stats.losses) > 0
              ? Math.round((stats.wins / (stats.wins + stats.draws + stats.losses)) * 100)
              : 0}% win rate</Text>
          </Text>
        </View>
      )}

      {stats !== null && stats.total > 0 && (
        <TouchableOpacity style={styles.bulkExportBtn} onPress={handleBulkExport}>
          <Text style={styles.bulkExportText}>↑ Export all PGN ({stats.total})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadGames(); }}
            tintColor="#4299e1"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading
              ? <Text style={styles.emptyText}>Loading…</Text>
              : search
                ? <Text style={styles.emptyText}>No games match "{search}"</Text>
                : <Text style={styles.emptyText}>No games yet. Play your first game!</Text>
            }
          </View>
        }
      />

      {/* Hint */}
      {filtered.length > 0 && (
        <Text style={styles.hint}>Long press a game to delete it</Text>
      )}
    </View>
  );
}

