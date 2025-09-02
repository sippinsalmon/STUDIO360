'use client';

import { useState, useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import InputAdornment from '@mui/material/InputAdornment';

import { DashboardContent } from 'src/layouts/dashboard';
import axiosInstance, { endpoints } from 'src/utils/axios';
import { Iconify } from 'src/components/iconify';
import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

const MOCK_CHAT_HISTORY = [];

const MOCK_SUGGESTIONS = [
  'Categorize recent transactions',
  'Generate monthly financial report',
  'Analyze expense patterns',
  'Reconcile bank statements',
  'Create budget recommendations',
  'Identify tax deductions',
];

function getStats() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('aiBookkeeperStats');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export default function AIBookkeeperPage() {
  useEffect(() => {
    document.title = 'AI Bookkeeper - AI Bookkeeper | Kitsch Studio';
  }, []);
  const theme = useTheme();
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState(MOCK_CHAT_HISTORY);
  const [stats, setStats] = useState(null);
  const sessionIdRef = useRef(null);

  // Load stats from backend (fallback to localStorage) and subscribe to updates
  useEffect(() => {
    const loadLocal = () => setStats(getStats());
    const load = async () => {
      try {
        const res = await fetch('/api/ai/stats');
        if (res.ok) {
          const json = await res.json();
          if (json?.success) {
            setStats(json.data || null);
            return;
          }
        }
        loadLocal();
      } catch (_) {
        loadLocal();
      }
    };
    load();
    window.addEventListener('storage', load);
    const id = setInterval(load, 1500); // lightweight poll to catch same-tab updates
    return () => {
      window.removeEventListener('storage', load);
      clearInterval(id);
    };
  }, []);

  const handleUploadClick = () => {
    window.location.href = '/dashboard/ai-bookkeeper/upload-process';
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    const newMessage = {
      id: chatHistory.length + 1,
      type: 'user',
      message: message,
      timestamp: 'Just now',
    };

    setChatHistory([...chatHistory, newMessage]);
    setMessage('');

    try {
      const res = await axiosInstance.post(endpoints.aiAssistantMessage, {
        message,
        sessionId: sessionIdRef.current,
        context: { page: 'ai-bookkeeper' },
      });
      const data = res?.data?.data || {};
      if (data.sessionId) sessionIdRef.current = data.sessionId;
      const aiResponse = {
        id: (prevId => prevId + 1)(chatHistory.length + 1),
        type: 'ai',
        message: data.reply || 'Okay.',
        timestamp: 'Just now',
      };
      setChatHistory(prev => [...prev, aiResponse]);
    } catch (err) {
      const aiResponse = {
        id: (prevId => prevId + 1)(chatHistory.length + 1),
        type: 'ai',
        message: 'Assistant is unavailable. Please try again shortly.',
        timestamp: 'Just now',
      };
      setChatHistory(prev => [...prev, aiResponse]);
      console.error('Assistant error:', err);
    }
  };

  return (
    <DashboardContent maxWidth="xl">
      {/* Header */}
      <Typography variant="h4" sx={{ mb: 1 }}>
        AI Bookkeeper
      </Typography>
      
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        Dashboard / Bookkeeping / AI Bookkeeper
      </Typography>

      {/* Overview Section */}
      <Card sx={{ p: 3, mb: 3, bgcolor: 'primary.lighter' }}>
        <Stack direction="row" alignItems="flex-start" spacing={2}>
          <Iconify icon="eva:bulb-fill" width={24} sx={{ color: 'primary.main', mt: 0.5 }} />
          <Box>
            <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
              AI Bookkeeper Overview
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Your intelligent assistant for automated bookkeeping. I can help categorize transactions, 
              generate reports, analyze patterns, and provide financial insights to streamline your accounting.
            </Typography>
          </Box>
        </Stack>
      </Card>

      {/* Upload CTA Section */}
      <Card sx={{ p: 3, mb: 3, bgcolor: 'secondary.lighter' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6" sx={{ mb: 1, color: 'secondary.main' }}>
              Start AI Bookkeeping Process
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Upload receipts, sales data, or Excel files to begin automated categorization and analysis
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<Iconify icon="eva:upload-fill" />}
            onClick={handleUploadClick}
            sx={{
              bgcolor: 'secondary.main',
              '&:hover': { bgcolor: 'secondary.dark' },
              px: 3,
              py: 1.5,
            }}
          >
            Upload Button for OCR/Excel
          </Button>
        </Stack>
      </Card>

      {/* Analytics Cards (responsive) */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
        <Card sx={{ p: 3, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
              <Iconify icon="eva:trending-up-fill" width={24} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                Transactions Processed
              </Typography>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {stats?.processed ?? 0}
              </Typography>
              <Label variant="soft" color="success" sx={{ fontSize: '0.75rem' }}>
                {stats ? '+live' : '+0'}
              </Label>
            </Box>
          </Stack>
        </Card>

        <Card sx={{ p: 3, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
              <Iconify icon="eva:checkmark-circle-2-fill" width={24} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                Accuracy Rate
              </Typography>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {(stats?.accuracyRate ?? 0) + '%'}
              </Typography>
              <Label variant="soft" color="success" sx={{ fontSize: '0.75rem' }}>
                {stats ? '+live' : '+0%'}
              </Label>
            </Box>
          </Stack>
        </Card>

        <Card sx={{ p: 3, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: 'warning.main', width: 48, height: 48 }}>
              <Iconify icon="eva:clock-fill" width={24} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                Time Saved
              </Typography>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {(stats?.timeSavedMinutes ?? 0) + ' mins'}
              </Typography>
              <Label variant="soft" color="success" sx={{ fontSize: '0.75rem' }}>
                {stats ? '+live' : '+0m'}
              </Label>
            </Box>
          </Stack>
        </Card>

        <Card sx={{ p: 3, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
              <Iconify icon="eva:credit-card-fill" width={24} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                Cost Savings
              </Typography>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {'₱' + (stats ? Number(stats.costSavings || 0).toLocaleString() : '0')}
              </Typography>
              <Label variant="soft" color="success" sx={{ fontSize: '0.75rem' }}>
                {stats ? '+live' : '+₱0'}
              </Label>
            </Box>
          </Stack>
        </Card>
      </Stack>

      {/* Main Content */}
      <Stack direction="row" spacing={3} sx={{ height: 600 }}>
        {/* Chat Interface */}
        <Card sx={{ p: 3, flex: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            AI Assistant
          </Typography>
          
          {/* Chat Messages */}
          <Box sx={{ 
            height: 450, 
            overflowY: 'auto', 
            mb: 2,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            p: 2,
          }}>
            {chatHistory.map((chat) => (
              <Box key={chat.id} sx={{ mb: 2 }}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Avatar 
                    sx={{ 
                      bgcolor: chat.type === 'ai' ? 'primary.main' : 'grey.500',
                      width: 32,
                      height: 32,
                    }}
                  >
                    {chat.type === 'ai' ? (
                      <Iconify icon="eva:bulb-fill" width={16} />
                    ) : (
                      <Iconify icon="eva:person-fill" width={16} />
                    )}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {chat.message}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {chat.timestamp}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Box>

          {/* Message Input */}
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              placeholder="Ask me anything about your bookkeeping..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleSendMessage} disabled={!message.trim()}>
                      <Iconify icon="eva:paper-plane-fill" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </Card>

        {/* Quick Actions & Suggestions */}
        <Card sx={{ p: 3, flex: 1 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Quick Actions
          </Typography>
          
          <Stack spacing={2}>
            {MOCK_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outlined"
                startIcon={<Iconify icon="eva:arrow-forward-fill" />}
                onClick={() => setMessage(suggestion)}
                sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                {suggestion}
              </Button>
            ))}
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" sx={{ mb: 2 }}>
            Recent Activity
          </Typography>
          
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Transaction Categorization
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                15 transactions categorized • 2 minutes ago
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Monthly Report Generated
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                September 2024 report • 1 hour ago
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Expense Analysis
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Pattern analysis completed • 3 hours ago
              </Typography>
            </Box>
          </Stack>
        </Card>
      </Stack>
    </DashboardContent>
  );
} 