import React from 'react';
import { Outlet, Link as RouterLink } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import QuizIcon from '@mui/icons-material/Quiz';
import SettingsIcon from '@mui/icons-material/Settings';

const drawerWidth = 240;

function AdminLayout() {
  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/admin' },
    { text: 'Kullanıcılar', icon: <PeopleIcon />, path: '/admin/users' },
    { text: 'Sorular', icon: <QuizIcon />, path: '/admin/questions' },
    // { text: 'Ayarlar', icon: <SettingsIcon />, path: '/admin/settings' }, // Henüz eklemedik
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}> {/* AppBar yüksekliğini çıkar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', position: 'relative', height: 'auto' },
        }}
      >
        <Toolbar>
             <Typography variant="h6" noWrap component="div"> Admin Paneli </Typography>
        </Toolbar>
        <Divider />
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton component={RouterLink} to={item.path}>
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{ flexGrow: 1, bgcolor: 'background.default', p: 3, overflowY: 'auto' }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}

export default AdminLayout;