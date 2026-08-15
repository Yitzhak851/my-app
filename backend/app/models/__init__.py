from datetime import datetime


class BaseModel:
    """Base model class for all models"""
    
    def to_dict(self):
        """Convert model instance to dictionary"""
        result = {}
        for key, value in self.__dict__.items():
            if not key.startswith('_'):
                if isinstance(value, datetime):
                    result[key] = value.isoformat()
                else:
                    result[key] = value
        return result


class User(BaseModel):
    """User model"""
    
    def __init__(self, id=None, email=None, password=None, name=None, 
                 bio=None, profile_picture=None, created_at=None):
        self.id = id
        self.email = email
        self.password = password
        self.name = name
        self.bio = bio
        self.profile_picture = profile_picture
        self.created_at = created_at


class Post(BaseModel):
    """Post model"""
    
    def __init__(self, id=None, user_id=None, title=None, body=None, 
                 image_url=None, created_at=None, user_name=None, 
                 user_email=None, user_profile_picture=None):
        self.id = id
        self.user_id = user_id
        self.title = title
        self.body = body
        self.image_url = image_url
        self.created_at = created_at
        self.user_name = user_name
        self.user_email = user_email
        self.user_profile_picture = user_profile_picture


class Follow(BaseModel):
    """Follow model"""
    
    def __init__(self, follower_id=None, following_id=None, created_at=None):
        self.follower_id = follower_id
        self.following_id = following_id
        self.created_at = created_at
