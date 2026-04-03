## List

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Daftar alamat berhasil diambil"
  },
  "data": [
    {
      // Data yang akan diisi
    }
  ],
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

## Detail

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Detail alamat berhasil diambil"
  },
  "data": {
    // Data yang akan diisi
  }
}
```

## Create

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Alamat berhasil ditambahkan"
  },
  "data": {
    // Data yang akan diisi
  }
}
```

## Update

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Alamat berhasil diupdate"
  },
  "data": {
    // Data yang akan diisi
  }
}
```

## Delete

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Alamat berhasil dihapus"
  },
  "data": {
    // Data yang akan diisi
  }
}
```

## Error

```json
{
  "meta": {
    "success": false,
    "status": 400,
    "message": "Error message"
  },
  "data": null
}
```
